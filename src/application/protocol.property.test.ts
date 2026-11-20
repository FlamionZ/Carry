import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { canonicalJson } from "../domain/canonical";
import { bytesToB64u, utf8Encode } from "../domain/encoding";
import { CarryError, PROTOCOL_ERROR_CODES } from "../domain/errors";
import type { PacketEnvelope } from "../domain/packet/schemas";
import { makeDevice, transfer } from "../test/helpers";
import { DURATIONS, LIMITS } from "../domain/limits";
import { decodePayload, encodePayload } from "./codec";
import type { Device } from "./device";
import { createCommunity } from "./use-cases/communities";
import { createIdentity } from "./use-cases/identity";
import { approveJoinRequest, createInvite, createJoinRequest } from "./use-cases/membership";
import { composeMessage, preparePacketForQr, readPacket } from "./use-cases/packets";
import { handleScannedText, type ScanOutcome } from "./use-cases/scan";
import { buildQrTransfer } from "./use-cases/transfer";

type Phone = ReturnType<typeof makeDevice>;

async function enroll(admin: Phone, member: Phone, communityId: string, name: string) {
  await createIdentity(member, name);
  const scanned = await transfer(member, (await createInvite(admin, communityId)).encoded);
  if (scanned.kind !== "INVITE") throw new Error(`expected INVITE, got ${scanned.kind}`);
  const pending = await createJoinRequest(member, scanned.invite, name);
  const received = await transfer(admin, pending.requestPayload!);
  if (received.kind !== "JOIN_REQUEST") throw new Error("expected JOIN_REQUEST");
  await transfer(member, await approveJoinRequest(admin, received.requestId));
}

/** Rejections a member may see for bad data: protocol codes, but never "already on this device". */
const REJECTION_CODES: ReadonlySet<string> = new Set(PROTOCOL_ERROR_CODES.filter((c) => c !== "PACKET_DUPLICATE"));

function expectRejection(err: unknown) {
  expect(err).toBeInstanceOf(CarryError);
  expect(REJECTION_CODES).toContain((err as CarryError).code);
}

/** Scans every frame like a persistent member would, recording outcomes and errors. */
async function scanAll(device: Device, frames: string[]) {
  const outcomes: ScanOutcome[] = [];
  const errors: unknown[] = [];
  for (const frame of frames) {
    try {
      outcomes.push(await handleScannedText(device, frame));
    } catch (err) {
      errors.push(err);
    }
  }
  return { outcomes, errors };
}

function shown(value: unknown): string {
  return value instanceof Error ? `${value.message} ${JSON.stringify(value)}` : JSON.stringify(value);
}

const asciiChar = fc.integer({ min: 0, max: 127 }).map((c) => String.fromCharCode(c));

function replaceAt(text: string, at: number, char: string): string {
  return text.slice(0, at) + char + text.slice(at + 1);
}

/**
 * A position in `json` and a different character to put there. Half the
 * positions are uniform; the rest fall on the first or last character of a
 * string or number value, where encodings carry padding bits and limits.
 */
function jsonCharChange(json: string, allowed: (at: number) => boolean) {
  const values = [...json.matchAll(/"((?:[^"\\]|\\.)*)"|-?\d+/g)]
    .map((m) =>
      m[1] === undefined
        ? { start: m.index, end: m.index + m[0].length }
        : { start: m.index + 1, end: m.index + 1 + m[1].length },
    )
    .filter((v) => v.end > v.start);
  const valueEdge = fc.constantFrom(...values).chain((v) => fc.constantFrom(v.start, v.end - 1));
  return fc
    .record({ at: fc.oneof(fc.nat({ max: json.length - 1 }), valueEdge), char: asciiChar })
    .filter(({ at, char }) => allowed(at) && json[at] !== char);
}

let A: Phone;
let B: Phone;
let C: Phone;
let communityId: string;

beforeAll(async () => {
  A = makeDevice();
  B = makeDevice();
  C = makeDevice();
  await createIdentity(A, "Alex");
  communityId = (await createCommunity(A, "Campus Volunteers")).id;
  await enroll(A, B, communityId, "Sam");
  await enroll(A, C, communityId, "Chris");
}, 30_000);

describe("tampering properties (multi-device)", () => {
  const text = "Tamper probe: meet at the north entrance.";
  let payload: string;

  beforeAll(async () => {
    payload = await preparePacketForQr(A, (await composeMessage(A, communityId, text)).id);
  });

  it("any single-character change in any frame is rejected and the text is never shown", async () => {
    // Frame lengths depend only on the payload, so positions are valid for every display.
    const layout = (await buildQrTransfer(payload)).map((f) => f.length);
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: layout.length - 1 }).chain((index) =>
          fc.record({ index: fc.constant(index), at: fc.nat({ max: layout[index]! - 1 }), char: asciiChar }),
        ),
        async ({ index, at, char }) => {
          // A fresh display of the same packet, so every run is an independent transfer.
          const frames = await buildQrTransfer(payload);
          const frame = frames[index]!;
          fc.pre(frame[at] !== char);
          frames[index] = replaceAt(frame, at, char);

          const before = await B.db.packets.count();
          const { outcomes, errors } = await scanAll(B, frames);
          expect(outcomes.some((o) => o.kind === "MESSAGE")).toBe(false);
          errors.forEach(expectRejection);
          for (const seen of [...outcomes, ...errors]) expect(shown(seen)).not.toContain("north entrance");
          expect(await B.db.packets.count()).toBe(before);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("any single-character change in the signed packet is rejected and the text is never shown", async () => {
    const json = canonicalJson(decodePayload(payload) as PacketEnvelope);
    // relay.hopCount is the documented mutable, unsigned hint (PACKET_PROTOCOL.md §11).
    const relayStart = json.indexOf('"relay":');
    const relayEnd = json.indexOf("}", relayStart) + 1;
    const signedPart = (at: number) => at < relayStart || at >= relayEnd;

    await fc.assert(
      fc.asyncProperty(jsonCharChange(json, signedPart), async ({ at, char }) => {
        const before = await B.db.packets.count();
        let outcome: ScanOutcome | undefined;
        let error: unknown;
        try {
          outcome = await transfer(B, bytesToB64u(utf8Encode(replaceAt(json, at, char))));
        } catch (err) {
          error = err;
        }
        expect(outcome).toBeUndefined();
        expectRejection(error);
        expect(shown(error)).not.toContain("north entrance");
        expect(await B.db.packets.count()).toBe(before);
      }),
      { numRuns: 300 },
    );
  });
});

function setClock(device: Phone, at: number) {
  device.advance(at - device.now());
}

describe("expiry and hop limit properties (multi-device)", () => {
  const nearExpiry = fc.oneof(
    fc.constantFrom(-1, 0, 1),
    fc.integer({ min: -DURATIONS.messageTtl, max: DURATIONS.messageTtl }),
  );

  it("a packet at or past expiry, or at its hop limit, is never imported or relayed", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          hopCount: fc.integer({ min: 0, max: LIMITS.maxHopsDefault + 2 }),
          importOffset: nearExpiry,
          relayDelay: fc.oneof(fc.constantFrom(0, 1), fc.nat({ max: DURATIONS.messageTtl })),
        }),
        async ({ hopCount, importOffset, relayDelay }) => {
          const msg = await composeMessage(A, communityId, "Short-lived");
          const env = decodePayload(await preparePacketForQr(A, msg.id)) as PacketEnvelope;
          // The copy a relay at this hop would show; relay.hopCount is not signed.
          const copy = encodePayload({ ...env, relay: { hopCount } });

          const importAt = env.expiresAt + importOffset;
          setClock(B, importAt);
          const expired = importAt >= env.expiresAt;
          if (expired || hopCount >= env.maxHops) {
            await expect(transfer(B, copy)).rejects.toMatchObject({
              code: expired ? "PACKET_EXPIRED" : "RELAY_LIMIT_REACHED",
            });
            await expect(readPacket(B, msg.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
            return;
          }
          await expect(transfer(B, copy)).resolves.toMatchObject({ kind: "MESSAGE", hopCount });

          const relayAt = importAt + relayDelay;
          setClock(B, relayAt);
          const relayExpired = relayAt >= env.expiresAt;
          if (relayExpired || hopCount + 1 >= env.maxHops) {
            await expect(preparePacketForQr(B, msg.id)).rejects.toMatchObject({
              code: relayExpired ? "PACKET_EXPIRED" : "RELAY_LIMIT_REACHED",
            });
          } else {
            const relayed = decodePayload(await preparePacketForQr(B, msg.id)) as PacketEnvelope;
            expect(relayed.relay.hopCount).toBe(hopCount + 1);
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("deduplication properties (multi-device)", () => {
  let D: Phone;

  beforeAll(async () => {
    D = makeDevice();
    await enroll(A, D, communityId, "Dana");
  });

  it("importing the same packet any number of times, through any number of transfers, yields one message", async () => {
    const maxCopies = 4;
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Each copy comes straight from the author (hop 0) or from a relay (hop 1),
          // shown with its own chunk size (0–100 % of the allowed range).
          copies: fc.array(fc.record({ via: fc.constantFrom("author", "relay"), size: fc.nat({ max: 100 }) }), {
            minLength: 1,
            maxLength: maxCopies,
          }),
          // Sort keys interleaving the frames of all copies in any order.
          order: fc.array(fc.nat(), { minLength: maxCopies * LIMITS.maxFrames, maxLength: maxCopies * LIMITS.maxFrames }),
        }),
        async ({ copies, order }) => {
          const text = "Water point moved to the library steps.";
          const msg = await composeMessage(A, communityId, text);
          const fromAuthor = await preparePacketForQr(A, msg.id);
          await transfer(C, fromAuthor);

          const frames: string[] = [];
          for (const { via, size } of copies) {
            const payload = via === "author" ? fromAuthor : await preparePacketForQr(C, msg.id);
            const min = Math.max(LIMITS.minChunk, Math.ceil(payload.length / LIMITS.maxFrames));
            const chunkSize = min + Math.round(((LIMITS.maxChunk - min) * size) / 100);
            frames.push(...(await buildQrTransfer(payload, chunkSize)));
          }
          const scanned = frames
            .map((frame, i) => ({ frame, key: order[i]! }))
            .sort((a, b) => a.key - b.key)
            .map((f) => f.frame);

          const before = await D.db.packets.count();
          const { outcomes, errors } = await scanAll(D, scanned);
          expect(outcomes.filter((o) => o.kind === "MESSAGE")).toHaveLength(1);
          expect(errors).toHaveLength(copies.length - 1);
          for (const err of errors) expect(err).toMatchObject({ code: "PACKET_DUPLICATE" });
          expect(await D.db.packets.count()).toBe(before + 1);
          expect((await readPacket(D, msg.id)).text).toBe(text);
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe("relay entry properties (multi-device)", () => {
  type Relay = PacketEnvelope["relay"];
  type Entry = NonNullable<Relay["entries"]>[number];
  let threeHops: PacketEnvelope;
  let entries: Entry[];
  let receiver: Phone;
  /** Members the receiver holds certificates for: the author and every relay. */
  let knownIds: string[];

  beforeAll(async () => {
    const D = makeDevice();
    receiver = makeDevice();
    await enroll(A, D, communityId, "Dana");
    await enroll(A, receiver, communityId, "Eli");
    // A message from each relay gives the receiver that relay's certificate.
    for (const relay of [B, C, D]) {
      const hello = await composeMessage(relay, communityId, "Hello Eli");
      await transfer(receiver, await preparePacketForQr(relay, hello.id));
    }

    const msg = await composeMessage(A, communityId, "Relay probe: meet at the north entrance.");
    let payload = await preparePacketForQr(A, msg.id);
    for (const relay of [B, C, D]) {
      await transfer(relay, payload);
      payload = await preparePacketForQr(relay, msg.id);
    }
    threeHops = decodePayload(payload) as PacketEnvelope;
    entries = threeHops.relay.entries!;
    expect(entries.map((e) => e.hop)).toEqual([1, 2, 3]);
    knownIds = [threeHops.senderId, ...entries.map((e) => e.memberId)];
  }, 30_000);

  const n = 3;
  const id16 = fc.uint8Array({ minLength: 16, maxLength: 16 }).map(bytesToB64u);
  const sig64 = fc.uint8Array({ minLength: 64, maxLength: 64 }).map(bytesToB64u);

  /** One field of one entry set to a different, schema-valid value. */
  const alteration = fc
    .record({
      index: fc.nat({ max: n - 1 }),
      change: fc.oneof(
        fc.record({ field: fc.constant("memberId" as const), value: fc.oneof(fc.constantFrom(0, 1, 2, 3), id16) }),
        fc.record({ field: fc.constant("hop" as const), value: fc.integer({ min: 1, max: 255 }) }),
        fc.record({
          field: fc.constant("at" as const),
          value: fc.oneof(fc.integer({ min: -DURATIONS.day, max: DURATIONS.day }), fc.constantFrom(-1, 1)),
        }),
        fc.record({ field: fc.constant("sig" as const), value: sig64 }),
      ),
    })
    .map(({ index, change }) => ({ kind: "alter" as const, index, change }));

  /** Every order of the entries except the original one. */
  const reordering = fc
    .shuffledSubarray([0, 1, 2], { minLength: n, maxLength: n })
    .filter((order) => order.some((i, at) => i !== at))
    .map((order) => ({ kind: "reorder" as const, order }));

  /**
   * Entries removed with a later entry kept. Removing only trailing entries is
   * the documented residual risk (SECURITY_MODEL.md §5A), so it is excluded.
   */
  const middleRemoval = fc
    .record({ removed: fc.subarray([0, 1, 2], { minLength: 1, maxLength: n - 1 }), lowerHopCount: fc.boolean() })
    .filter(({ removed }) => removed.some((r) => [0, 1, 2].some((k) => k > r && !removed.includes(k))))
    .map((r) => ({ kind: "remove" as const, ...r }));

  type Value<A> = A extends fc.Arbitrary<infer T> ? T : never;
  type Edit = Value<typeof alteration> | Value<typeof reordering> | Value<typeof middleRemoval>;

  function apply(edit: Edit): Relay {
    switch (edit.kind) {
      case "alter": {
        const { field, value } = edit.change;
        const entry = { ...entries[edit.index]! };
        if (field === "memberId") entry.memberId = typeof value === "number" ? knownIds[value]! : value;
        else if (field === "at") entry.at = entries[edit.index]!.at + value;
        else if (field === "hop") entry.hop = value;
        else entry.sig = value;
        return { hopCount: n, entries: entries.map((e, i) => (i === edit.index ? entry : e)) };
      }
      case "reorder":
        return { hopCount: n, entries: edit.order.map((i) => entries[i]!) };
      case "remove": {
        const kept = entries.filter((_, i) => !edit.removed.includes(i));
        return { hopCount: edit.lowerHopCount ? kept.length : n, entries: kept };
      }
    }
  }

  it("any alteration, reordering or middle removal of relay entries is rejected and the text is never shown", async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(alteration, reordering, middleRemoval), async (edit) => {
        const relay = apply(edit);
        fc.pre(JSON.stringify(relay) !== JSON.stringify(threeHops.relay));
        // Replacing the last entry's member with one nobody knows reads as an
        // unknown member appending an entry: accepted by design (§11A rule 5).
        const last = relay.entries!.at(-1)!;
        fc.pre(!(edit.kind === "alter" && edit.index === n - 1 && !knownIds.includes(last.memberId)));

        const before = await receiver.db.packets.count();
        let outcome: ScanOutcome | undefined;
        let error: unknown;
        try {
          outcome = await transfer(receiver, encodePayload({ ...threeHops, relay }));
        } catch (err) {
          error = err;
        }
        expect(outcome).toBeUndefined();
        expect(error).toMatchObject({ code: "RELAY_ENTRY_INVALID" });
        expect(shown(error)).not.toContain("north entrance");
        expect(await receiver.db.packets.count()).toBe(before);
      }),
      { numRuns: 200 },
    );
    // The unaltered packet is accepted by the same receiver.
    await expect(transfer(receiver, encodePayload(threeHops))).resolves.toMatchObject({ kind: "MESSAGE", hopCount: n });
  });
});
