/**
 * CARRY/1 relay entry conformance against the committed golden vectors
 * (PACKET_PROTOCOL.md §5, §10, §11A, §14).
 *
 * Each receiving device is rebuilt from public data, the relays' certificates
 * and the test-only community key in the vector file, then fed the frozen
 * bytes. If a code change makes any of these fail, phones on the new build can
 * no longer read relayed packets written by older builds. Fix the code, never
 * the vectors.
 */
import { describe, expect, it } from "vitest";
import { b64uToBytes } from "../domain/encoding";
import { packetRecordId } from "../domain/packet/rules";
import type { PacketEnvelope, PublicJwk } from "../domain/packet/schemas";
import { generateSigningKeyPair, generateVaultKey } from "../infrastructure/crypto/webcrypto";
import { makeDevice, transfer } from "../test/helpers";
import vectorsJson from "../test/vectors/carry-v1-relay.json";
import type { RelayGoldenVectors, RelayVectorHop, RelayVectorReceiver } from "../test/vectors/types";
import { decodePayload, encodePayload } from "./codec";
import { wrapGroupKey } from "./use-cases/keys";
import { readPacket } from "./use-cases/packets";

const v = vectorsJson as unknown as RelayGoldenVectors;
const c = v.context;
const message = decodePayload(v.valid.message) as PacketEnvelope;
const ack = decodePayload(v.valid.ack) as PacketEnvelope;
const messageRecordId = packetRecordId(c.communityId, message.packetId);
const ackRecordId = packetRecordId(c.communityId, ack.packetId);
const allRelayers = c.relayers.map((r) => r.memberId);

type Phone = ReturnType<typeof makeDevice>;

/**
 * Local identity with the given public key, the community and its key, and
 * membership records for the listed relays. The private key is unrelated;
 * these checks never sign.
 */
async function baseDevice(
  memberId: string,
  displayName: string,
  signingPublicJwk: PublicJwk,
  role: "ADMIN" | "MEMBER",
  knownRelayers: readonly string[],
): Promise<Phone> {
  const device = makeDevice(v.verifyAt);
  const unrelated = await generateSigningKeyPair();
  await device.db.localIdentity.add({
    id: "local",
    memberId,
    displayName,
    signingPrivateKey: unrelated.privateKey,
    signingPublicJwk,
    createdAt: v.generatedAt,
  });
  await device.db.deviceVault.add({ id: "default", vaultKey: await generateVaultKey(), createdAt: v.generatedAt });
  await device.db.communities.add({
    id: c.communityId,
    name: c.communityName,
    role,
    keyEpoch: c.keyEpoch,
    adminSigningPublicJwk: c.adminSigningPublicJwk,
    createdAt: v.generatedAt,
    status: "ACTIVE",
  });
  await device.db.communityKeys.add(await wrapGroupKey(device, c.communityId, c.keyEpoch, b64uToBytes(v.keys.groupKey)));
  for (const relayer of c.relayers.filter((r) => knownRelayers.includes(r.memberId))) {
    const body = relayer.certificate.body;
    await device.db.memberships.add({
      id: `${c.communityId}:${relayer.memberId}`,
      communityId: c.communityId,
      memberId: relayer.memberId,
      displayName: body.displayName,
      role: body.role,
      signingPublicJwk: body.signingPublicJwk,
      certificateBody: body,
      adminSignature: relayer.certificate.adminSignature,
      joinedAt: body.issuedAt,
      status: "ACTIVE",
    });
  }
  return device;
}

/** The administrator's phone holding its own outbound CHANGE message. */
async function authorDevice(knownRelayers: readonly string[]): Promise<Phone> {
  const device = await baseDevice(c.adminMemberId, c.adminDisplayName, c.adminSigningPublicJwk, "ADMIN", knownRelayers);
  await device.db.packets.add({
    id: messageRecordId,
    communityId: c.communityId,
    packetId: message.packetId,
    packetType: "MESSAGE",
    encodedEnvelope: v.valid.message,
    direction: "OUTBOUND",
    status: "READY",
    hopCount: 0,
    senderId: message.senderId,
    createdAt: message.createdAt,
    expiresAt: message.expiresAt,
    firstSeenAt: message.createdAt,
    lastActionAt: message.createdAt,
  });
  return device;
}

/** The acknowledging member's phone before it scanned the message. */
function memberDevice(knownRelayers: readonly string[]): Promise<Phone> {
  return baseDevice(c.acknowledgerMemberId, c.acknowledgerDisplayName, c.acknowledgerSigningPublicJwk, "MEMBER", knownRelayers);
}

const receivers: Record<RelayVectorReceiver, (known: readonly string[]) => Promise<Phone>> = {
  author: authorDevice,
  member: memberDevice,
};

const nameOf = (memberId: string) => c.relayers.find((r) => r.memberId === memberId)!.displayName;

/** The journey a device that knows every relay shows: each hop verified, no clock flags. */
const verified = (hops: RelayVectorHop[]) =>
  hops.map((h) => ({ ...h, status: "VERIFIED", displayName: nameOf(h.memberId), flags: [] }));

describe("CARRY/1 relay entry golden vectors: valid", () => {
  it("decode and re-encode byte for byte (canonical JSON is stable)", () => {
    for (const [name, payload] of Object.entries(v.valid)) {
      expect(encodePayload(decodePayload(payload)), name).toBe(payload);
    }
  });

  it("relays change only the relay section; entries are chained in hop order", () => {
    const chains = [
      [message, [v.valid.message, v.valid.messageRelayedOnce, v.valid.messageRelayedTwice]],
      [ack, [v.valid.ack, v.valid.ackRelayedOnce, v.valid.ackRelayedTwice]],
    ] as const;
    for (const [original, versions] of chains) {
      expect(original.relay).toEqual({ hopCount: 0 });
      versions.forEach((payload, hops) => {
        const env = decodePayload(payload) as PacketEnvelope;
        expect({ ...env, relay: original.relay }).toEqual(original);
        expect(env.relay.hopCount).toBe(hops);
        expect(env.relay.entries?.length ?? 0).toBe(hops);
      });
    }
    // The second relay appends; it does not rewrite the first entry.
    const once = decodePayload(v.valid.messageRelayedOnce) as PacketEnvelope;
    const twice = decodePayload(v.valid.messageRelayedTwice) as PacketEnvelope;
    expect(twice.relay.entries![0]).toEqual(once.relay.entries![0]);
  });

  it("MESSAGE relayed twice: imports with its kind and a verified two-hop journey", async () => {
    const device = await memberDevice(allRelayers);
    await expect(transfer(device, v.valid.messageRelayedTwice)).resolves.toMatchObject({
      kind: "MESSAGE",
      recordId: messageRecordId,
      hopCount: 2,
    });
    const view = await readPacket(device, messageRecordId);
    expect(view).toMatchObject({ text: c.messageText, messageKind: c.messageKind, senderRole: "ADMIN" });
    expect(view.journey).toEqual({ hopCount: 2, recorded: true, hops: verified(c.messageJourney) });
  });

  it("MESSAGE relayed once: imports with a one-hop journey", async () => {
    const device = await memberDevice(allRelayers);
    await transfer(device, v.valid.messageRelayedOnce);
    const view = await readPacket(device, messageRecordId);
    expect(view.journey).toEqual({ hopCount: 1, recorded: true, hops: verified(c.messageJourney.slice(0, 1)) });
  });

  it("MESSAGE relayed twice: relays this device has no certificate for are kept as unknown members", async () => {
    const device = await memberDevice([]);
    await transfer(device, v.valid.messageRelayedTwice);
    const view = await readPacket(device, messageRecordId);
    expect(view.journey).toEqual({
      hopCount: 2,
      recorded: true,
      hops: c.messageJourney.map((h) => ({ ...h, status: "UNKNOWN_MEMBER", flags: [] })),
    });
  });

  it("ACK relayed twice: marks the author's message Acknowledged and shows both journeys", async () => {
    const device = await authorDevice(allRelayers);
    await expect(transfer(device, v.valid.ackRelayedTwice)).resolves.toMatchObject({
      kind: "ACK",
      acknowledgedOwn: true,
      originalRecordId: messageRecordId,
    });
    expect((await device.db.packets.get(messageRecordId))?.status).toBe("ACKNOWLEDGED");
    const acks = (await readPacket(device, messageRecordId)).acknowledgements!;
    expect(acks).toHaveLength(1);
    expect(acks[0]).toMatchObject({
      ackRecordId,
      acknowledgedBy: c.acknowledgerMemberId,
      acknowledgedByName: c.acknowledgerDisplayName,
      outbound: { hopCount: 2, recorded: true, hops: verified(c.messageJourney) },
      back: { hopCount: 2, recorded: true, hops: verified(c.ackJourney) },
    });
  });

  it("ACK straight from the acknowledger: the copied journey is verified, the way back is empty", async () => {
    const device = await authorDevice(allRelayers);
    await transfer(device, v.valid.ack);
    const [returned] = (await readPacket(device, messageRecordId)).acknowledgements!;
    expect(returned).toMatchObject({
      outbound: { hopCount: 2, recorded: true, hops: verified(c.messageJourney) },
      back: { hopCount: 0, recorded: true, hops: [] },
    });
  });
});

describe("CARRY/1 relay entry golden vectors: invalid", () => {
  it.each(v.invalid.map((vector) => [vector.name, vector] as const))("rejects: %s", async (_name, vector) => {
    const device = await receivers[vector.receiver](vector.knownRelayers);
    const packetsBefore = await device.db.packets.count();
    const membershipsBefore = await device.db.memberships.count();
    let error: unknown;
    try {
      await transfer(device, vector.payload);
    } catch (err) {
      error = err;
    }
    expect(error).toMatchObject({ code: vector.error });
    // Nothing rejected is stored, and a rejected ACK never changes a message status.
    expect(await device.db.packets.count()).toBe(packetsBefore);
    expect(await device.db.memberships.count()).toBe(membershipsBefore);
    expect(await device.db.acknowledgements.count()).toBe(0);
    if (vector.receiver === "author") expect((await device.db.packets.get(messageRecordId))?.status).toBe("READY");
  });
});
