/**
 * CARRY/1 conformance against the committed golden vectors (PACKET_PROTOCOL.md §14).
 *
 * Each receiving device is rebuilt from public data plus the two test-only
 * secrets in the vector file, then fed the frozen bytes. If a code change makes
 * any of these fail, phones on the new build can no longer talk to phones on
 * older builds. Fix the code, never the vectors.
 */
import { describe, expect, it } from "vitest";
import { b64uToBytes } from "../domain/encoding";
import { packetRecordId } from "../domain/packet/rules";
import type { InvitePayload, JoinApprovalPayload, JoinRequestPayload, PacketEnvelope } from "../domain/packet/schemas";
import { generateSigningKeyPair, generateVaultKey } from "../infrastructure/crypto/webcrypto";
import { makeDevice, transfer } from "../test/helpers";
import vectorsJson from "../test/vectors/carry-v1.json";
import type { GoldenVectors, VectorReceiver } from "../test/vectors/types";
import { decodePayload, encodePayload } from "./codec";
import { wrapGroupKey } from "./use-cases/keys";
import { acceptJoinApproval, inspectInvite, joinRequestId, receiveJoinRequest } from "./use-cases/membership";
import { importPacket, readPacket } from "./use-cases/packets";
import { handleScannedText } from "./use-cases/scan";

const v = vectorsJson as unknown as GoldenVectors;
const c = v.context;
const invite = decodePayload(v.valid.invite) as InvitePayload;
const request = decodePayload(v.valid.joinRequest) as JoinRequestPayload;
const approval = decodePayload(v.valid.joinApproval) as JoinApprovalPayload;
const message = decodePayload(v.valid.message) as PacketEnvelope;
const messageRecordId = packetRecordId(c.communityId, message.packetId);

type Phone = ReturnType<typeof makeDevice>;

/** Local identity with the given public key. The private key is unrelated; these checks never sign. */
async function baseDevice(memberId: string, displayName: string, signingPublicJwk: JsonWebKey): Promise<Phone> {
  const device = makeDevice(v.verifyAt);
  const unrelated = await generateSigningKeyPair();
  await device.db.localIdentity.add({
    id: "local",
    memberId,
    displayName,
    signingPrivateKey: unrelated.privateKey,
    signingPublicJwk: signingPublicJwk as InvitePayload["adminSigningPublicJwk"],
    createdAt: v.generatedAt,
  });
  await device.db.deviceVault.add({ id: "default", vaultKey: await generateVaultKey(), createdAt: v.generatedAt });
  return device;
}

/** The administrator's phone: community key, the open invitation, and its own outbound MESSAGE. */
async function adminDevice(): Promise<Phone> {
  const device = await baseDevice(c.adminMemberId, c.adminDisplayName, invite.adminSigningPublicJwk);
  await device.db.communities.add({
    id: c.communityId,
    name: c.communityName,
    role: "ADMIN",
    keyEpoch: c.keyEpoch,
    adminSigningPublicJwk: invite.adminSigningPublicJwk,
    createdAt: v.generatedAt,
    status: "ACTIVE",
  });
  await device.db.communityKeys.add(await wrapGroupKey(device, c.communityId, c.keyEpoch, b64uToBytes(v.keys.groupKey)));
  await device.db.invites.add({
    id: c.inviteId,
    communityId: c.communityId,
    secretHash: c.inviteSecretHash,
    adminEphemeralEcdhPublicJwk: invite.adminEphemeralEcdhPublicJwk,
    expiresAt: c.inviteExpiresAt,
    maxUses: 1,
    uses: 0,
    createdAt: c.inviteCreatedAt,
    status: "ACTIVE",
  });
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

/** The joining phone after it scanned the invitation and showed its join request. */
async function pendingMemberDevice(): Promise<Phone> {
  const device = await baseDevice(c.memberId, c.memberDisplayName, request.memberSigningPublicJwk);
  const ecdhPrivateKey = await crypto.subtle.importKey(
    "jwk",
    v.keys.memberRequestEcdhPrivateJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  await device.db.pendingJoinRequests.add({
    id: joinRequestId(c.inviteId, c.memberId),
    communityId: c.communityId,
    communityName: c.communityName,
    inviteId: c.inviteId,
    memberId: c.memberId,
    memberEphemeralEcdhPrivateKey: ecdhPrivateKey,
    memberEphemeralEcdhPublicJwk: request.memberEphemeralEcdhPublicJwk,
    adminEphemeralEcdhPublicJwk: invite.adminEphemeralEcdhPublicJwk,
    adminSigningPublicJwk: invite.adminSigningPublicJwk,
    adminFingerprint: invite.adminFingerprint,
    requestNonce: request.requestNonce,
    requestedAt: request.requestedAt,
    expiresAt: c.joinRequestExpiresAt,
    status: "WAITING_FOR_APPROVAL",
  });
  return device;
}

/** The joined member: it accepted the golden approval and holds the key only that way. */
async function memberDevice(): Promise<Phone> {
  const device = await pendingMemberDevice();
  await acceptJoinApproval(device, approval);
  return device;
}

const receivers: Record<VectorReceiver, () => Promise<Phone>> = {
  admin: adminDevice,
  member: memberDevice,
  pendingMember: pendingMemberDevice,
};

describe("CARRY/1 golden vectors: valid", () => {
  it("decode and re-encode byte for byte (canonical JSON is stable)", () => {
    const payloads = Object.entries(v.valid).filter(([name]) => name !== "messageFrames") as [string, string][];
    for (const [name, payload] of payloads) {
      expect(encodePayload(decodePayload(payload)), name).toBe(payload);
    }
  });

  it("INVITE: carries no group key and its fingerprint matches the admin key", async () => {
    expect(Object.keys(invite)).not.toContain("groupKey");
    await expect(inspectInvite(makeDevice(v.verifyAt), invite)).resolves.toEqual({
      fingerprint: invite.adminFingerprint,
    });
  });

  it("JOIN_REQUEST: the admin accepts it with the stored invite secret hash", async () => {
    const record = await receiveJoinRequest(await adminDevice(), request);
    expect(record).toMatchObject({ status: "PENDING", displayName: c.memberDisplayName, memberId: c.memberId });
  });

  it("JOIN_APPROVAL: the member unwraps the group key and deletes its ECDH private key", async () => {
    const device = await memberDevice();
    expect(await device.db.communities.get(c.communityId)).toMatchObject({ role: "MEMBER", keyEpoch: c.keyEpoch });
    const pending = await device.db.pendingJoinRequests.get(joinRequestId(c.inviteId, c.memberId));
    expect(pending?.status).toBe("ACCEPTED");
    expect(pending?.memberEphemeralEcdhPrivateKey).toBeUndefined();
  });

  it("MESSAGE: the frames reassemble, verify and decrypt with the delivered key", async () => {
    const device = await memberDevice();
    let outcome;
    for (const frame of v.valid.messageFrames) outcome = await handleScannedText(device, frame);
    expect(outcome).toMatchObject({ kind: "MESSAGE", recordId: messageRecordId, hopCount: 0 });
    const view = await readPacket(device, messageRecordId);
    expect(view).toMatchObject({ text: c.messageText, senderName: c.adminDisplayName, senderRole: "ADMIN" });
  });

  it("relayed MESSAGE: same packet with hopCount 1; a duplicate where the original is known", async () => {
    const relayed = decodePayload(v.valid.messageRelayed) as PacketEnvelope;
    expect({ ...relayed, relay: message.relay }).toEqual(message);
    expect(relayed.relay.hopCount).toBe(1);

    const fresh = await memberDevice();
    await expect(transfer(fresh, v.valid.messageRelayed)).resolves.toMatchObject({ kind: "MESSAGE", hopCount: 1 });

    const seen = await memberDevice();
    await transfer(seen, v.valid.message);
    await expect(transfer(seen, v.valid.messageRelayed)).rejects.toMatchObject({ code: "PACKET_DUPLICATE" });
  });

  it("ACK: marks the admin's own message Acknowledged", async () => {
    const device = await adminDevice();
    await expect(transfer(device, v.valid.ack)).resolves.toMatchObject({
      kind: "ACK",
      acknowledgedOwn: true,
      originalRecordId: messageRecordId,
    });
    expect((await device.db.packets.get(messageRecordId))?.status).toBe("ACKNOWLEDGED");
  });

  it("member MESSAGE: verifies against the admin-issued certificate", async () => {
    const device = await adminDevice();
    const env = decodePayload(v.valid.memberMessage) as PacketEnvelope;
    const { record } = await importPacket(device, env);
    expect(await readPacket(device, record.id)).toMatchObject({
      text: c.memberMessageText,
      senderName: c.memberDisplayName,
      senderRole: "MEMBER",
    });
  });
});

describe("CARRY/1 golden vectors: invalid", () => {
  it.each(v.invalid.map((vector) => [vector.name, vector] as const))("rejects: %s", async (_name, vector) => {
    const device = await receivers[vector.receiver]();
    const packetsBefore = await device.db.packets.count();
    let error: unknown;
    try {
      if (vector.frames) for (const frame of vector.frames) await handleScannedText(device, frame);
      else await transfer(device, vector.payload!);
    } catch (err) {
      error = err;
    }
    expect(error).toMatchObject({ code: vector.error });
    // Nothing rejected is stored, and a rejected ACK never changes a message status.
    expect(await device.db.packets.count()).toBe(packetsBefore);
    if (vector.receiver === "admin") expect((await device.db.packets.get(messageRecordId))?.status).toBe("READY");
  });
});
