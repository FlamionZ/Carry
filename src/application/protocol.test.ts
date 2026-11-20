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
    const msg = await composeMessage(A, community.id, "Tamper probe: meet at the north entrance.");
    const env = decodePayload(msg.encodedEnvelope) as PacketEnvelope;
    // 111 characters: the last one carries 2 padding bits, which "1" sets.
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
