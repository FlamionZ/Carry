import { describe, expect, it } from "vitest";
import { b64uToBytes, bytesToB64u, utf8Decode } from "../domain/encoding";
import { DURATIONS } from "../domain/limits";
import { parseFrame, formatFrame } from "../domain/transfer/frames";
import { decodePayload, encodePayload } from "./codec";
import { createCommunity } from "./use-cases/communities";
import { createIdentity } from "./use-cases/identity";
import { approveJoinRequest, createInvite, createJoinRequest } from "./use-cases/membership";
import {
  buildExpiredFixture,
  composeMessage,
  createAcknowledgement,
  preparePacketForQr,
  readPacket,
} from "./use-cases/packets";
import { handleScannedText } from "./use-cases/scan";
import { buildQrTransfer } from "./use-cases/transfer";
import { runCleanup } from "./use-cases/maintenance";
import type { JoinRequestPayload, PacketEnvelope } from "../domain/packet/schemas";
import { makeDevice, transfer } from "../test/helpers";

type Phone = ReturnType<typeof makeDevice>;

async function enroll(admin: Phone, member: Phone, communityId: string, name: string) {
  const { encoded: invite } = await createInvite(admin, communityId);
  const scanned = await transfer(member, invite);
  if (scanned.kind !== "INVITE") throw new Error(`expected INVITE, got ${scanned.kind}`);
  const pending = await createJoinRequest(member, scanned.invite, name);

  const received = await transfer(admin, pending.requestPayload!);
  if (received.kind !== "JOIN_REQUEST") throw new Error("expected JOIN_REQUEST");
  const approval = await approveJoinRequest(admin, received.requestId);

  const accepted = await transfer(member, approval);
  expect(accepted).toMatchObject({ kind: "JOIN_APPROVAL", communityId });
  return { invite, pending, approval };
}

async function setup() {
  const A = makeDevice();
  const B = makeDevice();
  const C = makeDevice();
  await createIdentity(A, "Alex");
  await createIdentity(B, "Sam");
  await createIdentity(C, "Chris");
  const community = await createCommunity(A, "Campus Volunteers");
  return { A, B, C, community };
}

describe("CARRY/1 end-to-end (3 devices, no network)", () => {
  it("runs the full demo: join, message, relay, acknowledgement", async () => {
    const { A, B, C, community } = await setup();
    const { invite } = await enroll(A, B, community.id, "Sam");
    await enroll(A, C, community.id, "Chris");

    // Invitation must not contain the group key or any private key.
    const invitePayload = decodePayload(invite);
    expect(Object.keys(invitePayload).sort()).toEqual(
      [
        "adminEphemeralEcdhPublicJwk",
        "adminFingerprint",
        "adminSigningPublicJwk",
        "communityId",
        "communityName",
        "expiresAt",
        "inviteId",
        "inviteSecret",
        "type",
        "v",
      ].sort(),
    );
    // Admin stores only the hash of the invite secret.
    const storedInvite = await A.db.invites.get((invitePayload as { inviteId: string }).inviteId);
    expect(JSON.stringify({ ...storedInvite, adminEphemeralEcdhPrivateKey: null })).not.toContain(
      (invitePayload as { inviteSecret: string }).inviteSecret,
    );
    expect(storedInvite?.status).toBe("CONSUMED");
    expect(storedInvite?.adminEphemeralEcdhPrivateKey).toBeUndefined();

    // Joining device deleted its per-request ECDH private key.
    const bPending = await B.db.pendingJoinRequests.toArray();
    expect(bPending[0]?.status).toBe("ACCEPTED");
    expect(bPending[0]?.memberEphemeralEcdhPrivateKey).toBeUndefined();

    // A writes a message.
    const text = "Meet at the north entrance. Bring the first-aid kit.";
    const outbound = await composeMessage(A, community.id, text);
    expect(outbound.encodedEnvelope).not.toContain(text);
    const envA = decodePayload(outbound.encodedEnvelope) as PacketEnvelope;
    expect(utf8Decode(b64uToBytes(outbound.encodedEnvelope))).not.toContain("north entrance");

    // A → B
    const atB = await transfer(B, await preparePacketForQr(A, outbound.id));
    expect(atB.kind).toBe("MESSAGE");
    const viewB = await readPacket(B, outbound.id);
    expect(viewB.text).toBe(text);
    expect(viewB.senderName).toBe("Alex");

    // B relays → C; packet ID and ciphertext preserved, hopCount incremented.
    const relayPayload = await preparePacketForQr(B, outbound.id);
    const relayed = decodePayload(relayPayload) as PacketEnvelope;
    expect(relayed.packetId).toBe(envA.packetId);
    expect(relayed.ciphertext).toBe(envA.ciphertext);
    expect(relayed.senderSignature).toBe(envA.senderSignature);
    expect(relayed.relay.hopCount).toBe(1);
    expect((await B.db.packets.get(outbound.id))?.status).toBe("RELAYED");

    await transfer(C, relayPayload);
    expect((await readPacket(C, outbound.id)).text).toBe(text);

    // C acknowledges → B relays → A.
    const ack = await createAcknowledgement(C, outbound.id);
    const ackAtB = await transfer(B, await preparePacketForQr(C, ack.id));
    expect(ackAtB).toMatchObject({ kind: "ACK", acknowledgedOwn: false });
    expect((await B.db.packets.get(outbound.id))?.status).toBe("RELAYED");

    // Before the ACK returns, A's message is not acknowledged.
    expect((await A.db.packets.get(outbound.id))?.status).toBe("READY");
    const ackAtA = await transfer(A, await preparePacketForQr(B, ack.id));
    expect(ackAtA).toMatchObject({ kind: "ACK", acknowledgedOwn: true, originalRecordId: outbound.id });
    expect((await A.db.packets.get(outbound.id))?.status).toBe("ACKNOWLEDGED");
    const acks = await A.db.acknowledgements.where("originalPacketId").equals(envA.packetId).toArray();
    expect(acks).toHaveLength(1);
    expect(acks[0]).toMatchObject({ acknowledgedByName: "Chris" });
    expect(acks[0]?.receivedAt).not.toBeNull();

    // No plaintext is persisted anywhere in B's packet table.
    expect(JSON.stringify(await B.db.packets.toArray())).not.toContain("north entrance");

    // Handled transfers are deleted, so no device keeps raw QR chunks (which
    // for invitations and join requests contain the invite secret).
    for (const phone of [A, B, C]) expect(await phone.db.transfers.count()).toBe(0);

    // Display helpers: B sees C's ACK as referring to Alex's message.
    const ackViewB = await readPacket(B, ack.id);
    expect(ackViewB.original).toMatchObject({ found: true, outbound: false, senderName: "Alex", text });
    expect(ackViewB.share).toBe("OK");
  });

  it("shows each device only the status it observed", async () => {
    const { A, B, C, community } = await setup();
    await enroll(A, B, community.id, "Sam");
    await enroll(A, C, community.id, "Chris");
    const label = async (phone: Phone, id: string) => (await readPacket(phone, id)).statusLabel;

    // Author: Created until the frames are first shown, then Shown.
    const msg = await composeMessage(A, community.id, "Bring water to the north gate.");
    expect(await label(A, msg.id)).toBe("Created");
    const fromA = await preparePacketForQr(A, msg.id);
    expect(await label(A, msg.id)).toBe("Shown");

    // Relay: Received, then Shown for relay.
    await transfer(B, fromA);
    expect(await label(B, msg.id)).toBe("Received");
    const fromB = await preparePacketForQr(B, msg.id);
    expect(await label(B, msg.id)).toBe("Shown for relay");

    // Recipient: Received. Its own acknowledgement: Created, then Shown.
    await transfer(C, fromB);
    expect(await label(C, msg.id)).toBe("Received");
    const ack = await createAcknowledgement(C, msg.id);
    expect(await label(C, ack.id)).toBe("Created");
    const ackFromC = await preparePacketForQr(C, ack.id);
    expect(await label(C, ack.id)).toBe("Shown");

    // The acknowledgement travels back through B; only A's scan makes it Acknowledged.
    await transfer(B, ackFromC);
    expect(await label(B, ack.id)).toBe("Received");
    expect(await label(B, msg.id)).toBe("Shown for relay");
    expect(await label(A, msg.id)).toBe("Shown");
    await transfer(A, await preparePacketForQr(B, ack.id));
    expect(await label(A, msg.id)).toBe("Acknowledged");
    expect(await label(B, ack.id)).toBe("Shown for relay");
    expect(await label(C, msg.id)).toBe("Received");

    // Showing again keeps Shown; expiry overrides it.
    await preparePacketForQr(C, ack.id);
    expect(await label(C, ack.id)).toBe("Shown");
    C.advance(DURATIONS.messageTtl + 1);
    expect(await label(C, ack.id)).toBe("Expired");
  });

  it.each(["ANNOUNCEMENT", "CHANGE", "REQUEST"] as const)(
    "carries a %s message kind intact through a relay, inside the ciphertext only",
    async (kind) => {
      const { A, B, C, community } = await setup();
      await enroll(A, B, community.id, "Sam");
      await enroll(A, C, community.id, "Chris");

      const msg = await composeMessage(A, community.id, "Meeting point moved to the library steps.", kind);
      expect(await readPacket(A, msg.id)).toMatchObject({ messageKind: kind });

      // The kind is never in the cleartext envelope, header or relay metadata.
      const cleartext = utf8Decode(b64uToBytes(msg.encodedEnvelope));
      expect(cleartext).not.toContain("kind");
      expect(cleartext).not.toContain(kind);

      await transfer(B, await preparePacketForQr(A, msg.id));
      await transfer(C, await preparePacketForQr(B, msg.id));
      expect(await readPacket(C, msg.id)).toMatchObject({
        messageKind: kind,
        text: "Meeting point moved to the library steps.",
      });
    },
  );

  it("writes a new message as an Announcement unless another kind is chosen", async () => {
    const { A, B, community } = await setup();
    await enroll(A, B, community.id, "Sam");
    const msg = await composeMessage(A, community.id, "Hello");
    await transfer(B, await preparePacketForQr(A, msg.id));
    expect(await readPacket(B, msg.id)).toMatchObject({ messageKind: "ANNOUNCEMENT" });
  });

  it("marks duplicates without creating another inbox entry", async () => {
    const { A, B, community } = await setup();
    await enroll(A, B, community.id, "Sam");
    const msg = await composeMessage(A, community.id, "Hello");
    const payload = await preparePacketForQr(A, msg.id);
    await transfer(B, payload);

    // A fresh transfer of the same packet is reported as a duplicate.
    const frames = await buildQrTransfer(payload);
    expect(frames.length).toBeGreaterThan(1);
    for (const f of frames.slice(0, -1)) {
      await expect(handleScannedText(B, f)).resolves.toMatchObject({ kind: "PARTIAL" });
    }
    // Repeating a frame mid-transfer is idempotent.
    await expect(handleScannedText(B, frames[0]!)).resolves.toMatchObject({ kind: "PARTIAL", duplicateFrame: true });
    await expect(handleScannedText(B, frames.at(-1)!)).rejects.toMatchObject({ code: "PACKET_DUPLICATE" });
    // Scanning the same frames yet again is still a duplicate, never a new entry.
    for (const f of frames.slice(0, -1)) await handleScannedText(B, f);
    await expect(handleScannedText(B, frames.at(-1)!)).rejects.toMatchObject({ code: "PACKET_DUPLICATE" });
    expect(await B.db.packets.count()).toBe(1);
    expect(await B.db.transfers.count()).toBe(0);
  });

  it("rejects corrupted frames by digest", async () => {
    const { A, B, community } = await setup();
    await enroll(A, B, community.id, "Sam");
    const msg = await composeMessage(A, community.id, "Integrity check");
    const frames = await buildQrTransfer(await preparePacketForQr(A, msg.id));
    const first = parseFrame(frames[0]!);
    const flipped = first.chunk[5] === "A" ? "B" : "A";
    frames[0] = formatFrame({ ...first, chunk: first.chunk.slice(0, 5) + flipped + first.chunk.slice(6) });

    let error: unknown;
    try {
      for (const f of frames) await handleScannedText(B, f);
    } catch (err) {
      error = err;
    }
    expect(error).toMatchObject({ code: "TRANSFER_DIGEST_MISMATCH" });
    expect(await B.db.packets.count()).toBe(0);
  });

  it("rejects a re-signed-looking packet whose ciphertext was altered", async () => {
    const { A, B, community } = await setup();
    await enroll(A, B, community.id, "Sam");
    const msg = await composeMessage(A, community.id, "Do not alter");
    const env = decodePayload(msg.encodedEnvelope) as PacketEnvelope;
    const ct = b64uToBytes(env.ciphertext);
    ct[0] = ct[0]! ^ 0x01;
    const tampered = encodePayload({ ...env, ciphertext: bytesToB64u(ct) });
    await expect(transfer(B, tampered)).rejects.toMatchObject({ code: "SIGNATURE_INVALID" });

    const tamperedHeader = encodePayload({ ...env, expiresAt: env.expiresAt + 1 });
    await expect(transfer(B, tamperedHeader)).rejects.toMatchObject({ code: "SIGNATURE_INVALID" });
    expect(await B.db.packets.count()).toBe(0);
  });

  it("rejects a ciphertext whose last character has non-zero padding bits", async () => {
    // Shrunk counterexample of the single-character tampering property.
    const { A, B, community } = await setup();
    await enroll(A, B, community.id, "Sam");
    // Text length chosen so the body (which now includes the message kind) gives 110 ciphertext bytes.
    const msg = await composeMessage(A, community.id, "Tamper probe: meet at the north gate entrance.");
    const env = decodePayload(msg.encodedEnvelope) as PacketEnvelope;
    // 147 characters: the last one carries 2 padding bits, which "1" sets.
    expect(env.ciphertext.length % 4).toBe(3);
    const tampered = encodePayload({ ...env, ciphertext: env.ciphertext.slice(0, -1) + "1" });
    await expect(transfer(B, tampered)).rejects.toMatchObject({ code: "PACKET_SCHEMA_INVALID" });
    expect(await B.db.packets.count()).toBe(0);
  });

  it("rejects expired packets and refuses to relay them", async () => {
    const { A, B, community } = await setup();
    await enroll(A, B, community.id, "Sam");
    await expect(transfer(B, await buildExpiredFixture(A, community.id))).rejects.toMatchObject({
      code: "PACKET_EXPIRED",
    });

    const msg = await composeMessage(A, community.id, "Short-lived");
    await transfer(B, await preparePacketForQr(A, msg.id));
    B.advance(DURATIONS.messageTtl + 1);
    await expect(preparePacketForQr(B, msg.id)).rejects.toMatchObject({ code: "PACKET_EXPIRED" });
    await runCleanup(B);
    expect((await B.db.packets.get(msg.id))?.status).toBe("EXPIRED");
  });

  it("invalidates a transfer when a conflicting frame arrives", async () => {
    const { A, B, community } = await setup();
    await enroll(A, B, community.id, "Sam");
    const msg = await composeMessage(A, community.id, "Conflict check");
    const frames = await buildQrTransfer(await preparePacketForQr(A, msg.id));
    await handleScannedText(B, frames[0]!);

    const first = parseFrame(frames[0]!);
    const flipped = first.chunk[0] === "A" ? "B" : "A";
    const conflicting = formatFrame({ ...first, chunk: flipped + first.chunk.slice(1) });
    await expect(handleScannedText(B, conflicting)).rejects.toMatchObject({ code: "FRAME_CONFLICT" });

    // The whole transfer is now refused, and its chunks were discarded.
    await expect(handleScannedText(B, frames[1]!)).rejects.toMatchObject({ code: "FRAME_CONFLICT" });
    const stored = await B.db.transfers.get(first.transferId);
    expect(stored).toMatchObject({ status: "INVALID", chunks: {} });

    // A fresh display of the same packet still imports.
    await expect(transfer(B, await preparePacketForQr(A, msg.id))).resolves.toMatchObject({ kind: "MESSAGE" });
  });

  it("rejects packets from communities this device is not in", async () => {
    const { A, B, community } = await setup();
    const msg = await composeMessage(A, community.id, "Members only");
    await expect(transfer(B, msg.encodedEnvelope)).rejects.toMatchObject({ code: "UNKNOWN_COMMUNITY" });
  });

  it("enforces single-use and expiring invitations", async () => {
    const { A, B, C, community } = await setup();
    const { invite } = await enroll(A, B, community.id, "Sam");

    // C reuses B's (consumed) invitation.
    const scanned = await transfer(C, invite);
    if (scanned.kind !== "INVITE") throw new Error("expected INVITE");
    const pending = await createJoinRequest(C, scanned.invite, "Chris");
    await expect(transfer(A, pending.requestPayload!)).rejects.toMatchObject({ code: "INVITE_ALREADY_USED" });

    const { encoded: fresh } = await createInvite(A, community.id);
    C.advance(DURATIONS.inviteTtl + 1);
    await expect(transfer(C, fresh)).rejects.toMatchObject({ code: "INVITE_EXPIRED" });
  });

  it("requires a valid invite secret before storing a join request", async () => {
    const { A, B, community } = await setup();
    const { encoded } = await createInvite(A, community.id);
    const scanned = await transfer(B, encoded);
    if (scanned.kind !== "INVITE") throw new Error("expected INVITE");
    const pending = await createJoinRequest(B, scanned.invite, "Sam");
    const req = decodePayload(pending.requestPayload!) as { inviteSecret: string };
    const original = decodePayload(pending.requestPayload!) as JoinRequestPayload;
    const forged = encodePayload({ ...original, inviteSecret: "A".repeat(22) });
    expect(req.inviteSecret).not.toBe("A".repeat(22));
    await expect(transfer(A, forged)).rejects.toMatchObject({ code: "JOIN_REQUEST_INVALID" });
    expect(await A.db.joinRequests.count()).toBe(0);
  });

  it("rejects an approval meant for a different device", async () => {
    const { A, B, C, community } = await setup();
    const { approval } = await enroll(A, B, community.id, "Sam");
    await expect(transfer(C, approval)).rejects.toMatchObject({ code: "JOIN_APPROVAL_INVALID" });
    expect(await C.db.communities.count()).toBe(0);
  });

  it("fits the demo message in at most 8 frames", async () => {
    const { A, community } = await setup();
    const msg = await composeMessage(A, community.id, "x".repeat(280));
    const frames = await buildQrTransfer(msg.encodedEnvelope);
    expect(frames.length).toBeLessThanOrEqual(8);
    for (const f of frames) expect(f.length).toBeLessThanOrEqual(480);
  });
});

// ── Relay entries (PACKET_PROTOCOL.md §11A) ───────────────────────────────

const enc = new TextEncoder();
const subtle = globalThis.crypto.subtle;

/** SHA-256 → Base64URL, written out here from the spec rather than via the app's helpers. */
async function hashB64u(text: string): Promise<string> {
  return bytesToB64u(new Uint8Array(await subtle.digest("SHA-256", enc.encode(text))));
}

async function verifiesAs(jwk: JsonWebKey, sig: string, text: string): Promise<boolean> {
  const key = await subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  return subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, b64uToBytes(sig), enc.encode(text));
}

async function memberIdOf(phone: Phone): Promise<string> {
  return (await phone.db.localIdentity.get("local"))!.memberId;
}

describe("relay entries (3 devices, no network)", () => {
  async function relayChain() {
    const { A, B, C, community } = await setup();
    await enroll(A, B, community.id, "Sam");
    await enroll(A, C, community.id, "Chris");
    const msg = await composeMessage(A, community.id, "Water point moved to the library steps.");
    const fromA = await preparePacketForQr(A, msg.id);
    await transfer(B, fromA);
    return { A, B, C, community, msg, fromA };
  }

  it("a relay signs exactly one entry and increments hopCount; the signed packet is unchanged", async () => {
    const { B, msg, fromA } = await relayChain();
    const original = decodePayload(fromA) as PacketEnvelope;
    B.advance(60_000);
    const relayed = decodePayload(await preparePacketForQr(B, msg.id)) as PacketEnvelope;

    expect({ ...relayed, relay: original.relay }).toEqual(original);
    expect(relayed.relay.hopCount).toBe(1);
    expect(relayed.relay.entries).toHaveLength(1);
    const entry = relayed.relay.entries![0]!;
    const sam = await B.db.localIdentity.get("local");
    expect(entry).toEqual({ memberId: sam!.memberId, hop: 1, at: B.now(), sig: expect.any(String) });

    const prevHash = await hashB64u(original.senderSignature);
    const signing = `CARRY|1|RELAY|${original.packetId}|1|${sam!.memberId}|${entry.at}|${prevHash}`;
    expect(await verifiesAs(sam!.signingPublicJwk, entry.sig, signing)).toBe(true);

    // Showing again makes a fresh entry from the stored packet; it never stacks.
    B.advance(60_000);
    const again = decodePayload(await preparePacketForQr(B, msg.id)) as PacketEnvelope;
    expect(again.relay.hopCount).toBe(1);
    expect(again.relay.entries).toHaveLength(1);
    expect(again.relay.entries![0]!.at).toBe(B.now());
  });

  it("the receiver shows a relay it has no certificate for as an unknown member, then verified once known", async () => {
    const { B, C, community, msg } = await relayChain();
    const samId = await memberIdOf(B);
    B.advance(60_000);
    await transfer(C, await preparePacketForQr(B, msg.id));

    const atC = await readPacket(C, msg.id);
    expect(atC.journey).toEqual({
      hopCount: 1,
      recorded: true,
      hops: [{ hop: 1, memberId: samId, at: B.now(), status: "UNKNOWN_MEMBER", flags: [] }],
    });

    // C learns Sam's certificate from a message Sam wrote; the same entry now verifies.
    const fromSam = await composeMessage(B, community.id, "Sam here.");
    await transfer(C, await preparePacketForQr(B, fromSam.id));
    expect((await readPacket(C, msg.id)).journey?.hops[0]).toMatchObject({
      status: "VERIFIED",
      displayName: "Sam",
    });
  });

  it("each relay chains from the one before; a device that knows both relays verifies both", async () => {
    const { A, B, C, community, msg, fromA } = await relayChain();
    await transfer(C, await preparePacketForQr(B, msg.id));
    C.advance(60_000);
    const twoHops = decodePayload(await preparePacketForQr(C, msg.id)) as PacketEnvelope;
    expect(twoHops.relay.hopCount).toBe(2);
    const [e1, e2] = twoHops.relay.entries!;

    // Entry 2 signs over the hash of entry 1's signing string and signature.
    const original = decodePayload(fromA) as PacketEnvelope;
    const s1 = `CARRY|1|RELAY|${original.packetId}|1|${e1!.memberId}|${e1!.at}|${await hashB64u(original.senderSignature)}`;
    const s2 = `CARRY|1|RELAY|${original.packetId}|2|${e2!.memberId}|${e2!.at}|${await hashB64u(`${s1}|${e1!.sig}`)}`;
    const chris = (await C.db.localIdentity.get("local"))!;
    expect(e2!.memberId).toBe(chris.memberId);
    expect(await verifiesAs(chris.signingPublicJwk, e2!.sig, s2)).toBe(true);

    // D has seen messages from Sam and Chris, so it holds both certificates.
    const D = makeDevice();
    await createIdentity(D, "Dana");
    await enroll(A, D, community.id, "Dana");
    for (const author of [B, C]) {
      const hello = await composeMessage(author, community.id, "Hello Dana");
      await transfer(D, await preparePacketForQr(author, hello.id));
    }
    await transfer(D, encodePayload(twoHops));
    const journey = (await readPacket(D, msg.id)).journey!;
    expect(journey.hops.map((h) => [h.hop, h.displayName, h.status])).toEqual([
      [1, "Sam", "VERIFIED"],
      [2, "Chris", "VERIFIED"],
    ]);
  });

  it("rejects miscounted, reordered, broken-chain and badly signed entries without storing the packet", async () => {
    const { A, B, C, community, msg } = await relayChain();
    await transfer(C, await preparePacketForQr(B, msg.id));
    const twoHops = decodePayload(await preparePacketForQr(C, msg.id)) as PacketEnvelope;
    const [e1, e2] = twoHops.relay.entries!;

    // D knows Chris (hop 2) but not Sam (hop 1).
    const D = makeDevice();
    await createIdentity(D, "Dana");
    await enroll(A, D, community.id, "Dana");
    const hello = await composeMessage(C, community.id, "Hello Dana");
    await transfer(D, await preparePacketForQr(C, hello.id));
    const before = await D.db.packets.count();

    const variants: Record<string, PacketEnvelope["relay"]> = {
      "fewer entries than hopCount": { hopCount: 2, entries: [e1!] },
      "more entries than hopCount": { hopCount: 1, entries: [e1!, e2!] },
      "entries present at hop 0": { hopCount: 0, entries: [e1!] },
      "hops out of order": { hopCount: 2, entries: [e2!, e1!] },
      "hop numbers renumbered": { hopCount: 2, entries: [e1!, { ...e2!, hop: 3 }] },
      // Sam's entry cannot be checked here, but Chris's signature covers it through the chain.
      "unknown member's entry altered": { hopCount: 2, entries: [{ ...e1!, at: e1!.at + 1 }, e2!] },
      "known member's signature replaced": { hopCount: 2, entries: [e1!, { ...e2!, sig: e1!.sig }] },
    };
    for (const [name, relay] of Object.entries(variants)) {
      await expect(transfer(D, encodePayload({ ...twoHops, relay })), name).rejects.toMatchObject({
        code: "RELAY_ENTRY_INVALID",
      });
    }
    expect(await D.db.packets.count()).toBe(before);
    await expect(transfer(D, encodePayload(twoHops))).resolves.toMatchObject({ kind: "MESSAGE", hopCount: 2 });
  });

  it("accepts a packet without entries as an unrecorded journey, and its relay adds no entry", async () => {
    const { B, C, msg, fromA } = await relayChain();
    const original = decodePayload(fromA) as PacketEnvelope;
    // As an older build relays it: entries stripped, hopCount still counted.
    await transfer(C, encodePayload({ ...original, relay: { hopCount: 2 } }));
    expect((await readPacket(C, msg.id)).journey).toEqual({ hopCount: 2, recorded: false, hops: [] });

    const fromC = decodePayload(await preparePacketForQr(C, msg.id)) as PacketEnvelope;
    expect(fromC.relay).toEqual({ hopCount: 3 });

    // Straight from the author: recorded, with no relays.
    expect((await readPacket(B, msg.id)).journey).toEqual({ hopCount: 0, recorded: true, hops: [] });
  });

  it("flags relay times outside 5 minutes of creation and of this device's scan, without rejecting", async () => {
    const tolerance = 5 * 60_000;
    const { A, B, community, msg, fromA } = await relayChain();
    const { createdAt } = decodePayload(fromA) as PacketEnvelope;
    const scanAt = createdAt + DURATIONS.hour;

    const cases: [number, string[]][] = [
      [createdAt - tolerance, []],
      [createdAt - tolerance - 1, ["BEFORE_CREATION"]],
      [scanAt + tolerance, []],
      [scanAt + tolerance + 1, ["IN_FUTURE"]],
    ];
    for (const [i, [at, flags]] of cases.entries()) {
      B.advance(at - B.now());
      const relayed = await preparePacketForQr(B, msg.id);
      // A fresh receiver each time, scanning an hour after the message was written.
      const receiver = makeDevice();
      await createIdentity(receiver, `Receiver ${i}`);
      await enroll(A, receiver, community.id, `Receiver ${i}`);
      receiver.advance(scanAt - receiver.now());
      await transfer(receiver, relayed);
      const hop = (await readPacket(receiver, msg.id)).journey?.hops[0];
      expect(hop?.flags, `relay at creation ${at - createdAt >= 0 ? "+" : ""}${at - createdAt} ms`).toEqual(flags);
    }
  });

  it("refuses to relay when the next entry does not fit in the payload limit", async () => {
    const { A, B, C, community } = await setup();
    const phones = [B, C, makeDevice(), makeDevice(), makeDevice()];
    await enroll(A, B, community.id, "Sam");
    await enroll(A, C, community.id, "Chris");
    for (const [i, p] of phones.slice(2).entries()) {
      await createIdentity(p, `Relay ${i}`);
      await enroll(A, p, community.id, `Relay ${i}`);
    }
    // 280 two-byte characters: the largest message this build lets anyone write.
    const msg = await composeMessage(A, community.id, "é".repeat(280));
    let payload = await preparePacketForQr(A, msg.id);
    let error: unknown;
    for (const p of phones) {
      await transfer(p, payload);
      try {
        payload = await preparePacketForQr(p, msg.id);
      } catch (err) {
        error = err;
        break;
      }
      expect(payload.length).toBeLessThanOrEqual(2880);
    }
    expect(error).toMatchObject({ code: "RELAY_LIMIT_REACHED" });
    expect((decodePayload(payload) as PacketEnvelope).relay.hopCount).toBeLessThan(5);
  });
});

// ── Acknowledgement journey (PACKET_PROTOCOL.md §10) ──────────────────────

describe("acknowledgement journey (3 devices, no network)", () => {
  /** Fresh phones: A → B → C, then C acknowledges. */
  async function acknowledgedViaSam() {
    const { A, B, C, community } = await setup();
    await enroll(A, B, community.id, "Sam");
    await enroll(A, C, community.id, "Chris");
    const msg = await composeMessage(A, community.id, "Water point moved to the library steps.");
    await transfer(B, await preparePacketForQr(A, msg.id));
    B.advance(60_000);
    await transfer(C, await preparePacketForQr(B, msg.id));
    return { A, B, C, community, msg };
  }

  it("A → B → C, C acknowledges, the ACK returns C → B → A: on A both journeys are verified", async () => {
    const { A, B, C, msg } = await acknowledgedViaSam();
    const samId = await memberIdOf(B);
    const chrisId = await memberIdOf(C);
    const storedAtC = decodePayload((await C.db.packets.get(msg.id))!.encodedEnvelope) as PacketEnvelope;

    C.advance(60_000);
    const ack = await createAcknowledgement(C, msg.id);
    const ackFromC = await preparePacketForQr(C, ack.id);
    // The copy travels inside the ciphertext: no relay signature is readable on the ACK.
    expect(utf8Decode(b64uToBytes(ackFromC))).not.toContain(storedAtC.relay.entries![0]!.sig);
    await transfer(B, ackFromC);
    B.advance(60_000);
    const ackFromB = decodePayload(await preparePacketForQr(B, ack.id)) as PacketEnvelope;
    expect(ackFromB.relay.entries?.map((e) => e.memberId)).toEqual([samId]);

    await expect(transfer(A, encodePayload(ackFromB))).resolves.toMatchObject({ kind: "ACK", acknowledgedOwn: true });
    const view = await readPacket(A, msg.id);
    expect(view.statusLabel).toBe("Acknowledged");
    expect(view.acknowledgements).toHaveLength(1);
    const [returned] = view.acknowledgements!;
    expect(returned).toMatchObject({ acknowledgedBy: chrisId, acknowledgedByName: "Chris" });
    // Out: exactly the entries C stored on import, re-verified on A against A's own message.
    expect(returned!.outbound).toEqual({
      hopCount: 1,
      recorded: true,
      hops: [
        {
          hop: 1,
          memberId: samId,
          at: storedAtC.relay.entries![0]!.at,
          status: "VERIFIED",
          displayName: "Sam",
          flags: [],
        },
      ],
    });
    // Back: the ACK's own entries, signed over the ACK's packet ID.
    expect(returned!.back).toEqual({
      hopCount: 1,
      recorded: true,
      hops: [{ hop: 1, memberId: samId, at: B.now(), status: "VERIFIED", displayName: "Sam", flags: [] }],
    });
  });

  it("the author rejects a forged or mismatched copied journey; relays carry it unchecked", async () => {
    const { A, B, C, community, msg } = await acknowledgedViaSam();
    const stored = decodePayload((await C.db.packets.get(msg.id))!.encodedEnvelope) as PacketEnvelope;
    const [e1] = stored.relay.entries!;
    // Sam's entry for a different message, which reached C the same way.
    const other = await composeMessage(A, community.id, "Second message.");
    await transfer(B, await preparePacketForQr(A, other.id));
    await transfer(C, await preparePacketForQr(B, other.id));
    const [otherEntry] = (decodePayload((await C.db.packets.get(other.id))!.encodedEnvelope) as PacketEnvelope).relay
      .entries!;

    /** C (a dishonest member) acknowledges after rewriting its stored copy; B carries the ACK to A. */
    async function ackWithCopiedRelay(relay: PacketEnvelope["relay"]) {
      await C.db.packets.update(msg.id, { encodedEnvelope: encodePayload({ ...stored, relay }) });
      await C.db.packets.where("originalPacketId").equals(stored.packetId).delete();
      const ack = await createAcknowledgement(C, msg.id);
      await expect(transfer(B, await preparePacketForQr(C, ack.id))).resolves.toMatchObject({ kind: "ACK" });
      return preparePacketForQr(B, ack.id);
    }

    const variants: Record<string, PacketEnvelope["relay"]> = {
      "relay time altered": { hopCount: 1, entries: [{ ...e1!, at: e1!.at + 1 }] },
      "entry copied from another message": { hopCount: 1, entries: [otherEntry!] },
      "signature from another message": { hopCount: 1, entries: [{ ...e1!, sig: otherEntry!.sig }] },
      "fewer entries than hopCount": { hopCount: 2, entries: [e1!] },
      "entries on a message never relayed": { hopCount: 0, entries: [e1!] },
      "hop renumbered": { hopCount: 1, entries: [{ ...e1!, hop: 2 }] },
    };
    const before = await A.db.packets.count();
    for (const [name, relay] of Object.entries(variants)) {
      await expect(transfer(A, await ackWithCopiedRelay(relay)), name).rejects.toMatchObject({
        code: "RELAY_ENTRY_INVALID",
      });
    }
    expect(await A.db.packets.count()).toBe(before);
    expect(await A.db.acknowledgements.count()).toBe(0);
    expect((await readPacket(A, msg.id)).statusLabel).not.toBe("Acknowledged");

    // The honest copy is accepted by the same author.
    await expect(transfer(A, await ackWithCopiedRelay(stored.relay))).resolves.toMatchObject({
      kind: "ACK",
      acknowledgedOwn: true,
    });
    expect((await readPacket(A, msg.id)).acknowledgements?.[0]?.outbound?.hops[0]?.status).toBe("VERIFIED");
  });

  it("an ACK copying an unrecorded journey is accepted and says so", async () => {
    const { A, B, C, msg } = await acknowledgedViaSam();
    const stored = decodePayload((await C.db.packets.get(msg.id))!.encodedEnvelope) as PacketEnvelope;
    // As if an older build had relayed the message to C: entries stripped.
    await C.db.packets.update(msg.id, { encodedEnvelope: encodePayload({ ...stored, relay: { hopCount: 1 } }) });
    const ack = await createAcknowledgement(C, msg.id);
    await transfer(B, await preparePacketForQr(C, ack.id));
    await transfer(A, await preparePacketForQr(B, ack.id));
    expect((await readPacket(A, msg.id)).acknowledgements?.[0]?.outbound).toEqual({
      hopCount: 1,
      recorded: false,
      hops: [],
    });
  });
});
