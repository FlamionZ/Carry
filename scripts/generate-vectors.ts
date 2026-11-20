/**
 * Writes the CARRY/1 golden vectors (PACKET_PROTOCOL.md §14) by running the
 * real protocol flows between two simulated devices. Run with `npm run vectors`.
 *
 * The committed vectors must never change for protocol v1: they prove that new
 * builds still read what older builds wrote. The script refuses to overwrite
 * an existing file: the run fails with a refusal message. Delete it only when
 * introducing a new protocol version.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { test } from "vitest";
import { decodePayload, encodePayload } from "../src/application/codec";
import { createCommunity } from "../src/application/use-cases/communities";
import { createIdentity } from "../src/application/use-cases/identity";
import { unwrapGroupKeyBytes } from "../src/application/use-cases/keys";
import { approveJoinRequest, createInvite, createJoinRequest } from "../src/application/use-cases/membership";
import {
  buildExpiredFixture,
  composeMessage,
  createAcknowledgement,
  preparePacketForQr,
} from "../src/application/use-cases/packets";
import { handleScannedText } from "../src/application/use-cases/scan";
import { buildQrTransfer } from "../src/application/use-cases/transfer";
import { bytesToB64u, utf8Encode } from "../src/domain/encoding";
import { DURATIONS } from "../src/domain/limits";
import type { CarryPayload, JoinApprovalPayload, JoinRequestPayload, PacketEnvelope } from "../src/domain/packet/schemas";
import { makeDevice, transfer } from "../src/test/helpers";
import type { GoldenVectors, InvalidVector } from "../src/test/vectors/types";

const OUT = "src/test/vectors/carry-v1.json";
const T0 = Date.UTC(2026, 0, 15, 9, 0, 0);

/** Change one Base64URL character away from the end, so the string stays canonical. */
function flipChar(s: string, at = Math.floor(s.length / 2)): string {
  return s.slice(0, at) + (s[at] === "A" ? "B" : "A") + s.slice(at + 1);
}

function withChunk(frame: string, edit: (chunk: string) => string): string {
  const parts = frame.split(":");
  parts[5] = edit(parts[5]!);
  return parts.join(":");
}

/** Encode a deliberately broken payload; canonical JSON does not validate. */
const encodeRaw = (value: unknown) => encodePayload(value as CarryPayload);

// Fails with the refusal below when the file exists. `npm run vectors` runs
// only this generator, so the relay file existing does not matter here.
test("generate CARRY/1 golden vectors", async () => {
  if (existsSync(OUT)) {
    throw new Error(`${OUT} exists. Golden vectors must not change; delete it only for a new protocol version.`);
  }

  // Generator only: make every key extractable so the file can include the
  // single private key the verifier needs. App code is otherwise unchanged.
  const subtle = crypto.subtle;
  const generateKey = subtle.generateKey.bind(subtle) as (...args: unknown[]) => Promise<unknown>;
  Object.defineProperty(subtle, "generateKey", {
    configurable: true,
    value: (algorithm: unknown, _extractable: boolean, usages: unknown) => generateKey(algorithm, true, usages),
  });

  try {
    const admin = makeDevice(T0);
    const member = makeDevice(T0);
    const adminIdentity = await createIdentity(admin, "Alex");
    const memberIdentity = await createIdentity(member, "Sam");
    const community = await createCommunity(admin, "Campus Volunteers");

    // Invitation → join request → approval, moved as QR frames like on real phones.
    const created = await createInvite(admin, community.id);
    await transfer(member, created.encoded);
    const pending = await createJoinRequest(member, created.payload, "Sam");
    const memberRequestEcdhPrivateJwk = await subtle.exportKey("jwk", pending.memberEphemeralEcdhPrivateKey!);
    const received = await transfer(admin, pending.requestPayload!);
    if (received.kind !== "JOIN_REQUEST") throw new Error("join request was not accepted");
    const joinApproval = await approveJoinRequest(admin, received.requestId);
    await transfer(member, joinApproval);

    // Messages, relay and acknowledgement.
    const messageText = "Meet at the north entrance. Bring the first-aid kit.";
    const memberMessageText = "On my way with the kit.";
    const message = await composeMessage(admin, community.id, messageText);
    const messageFrames = await buildQrTransfer(message.encodedEnvelope);
    if (messageFrames.length < 2) throw new Error("the frame vectors need a multi-frame message");
    for (const frame of messageFrames) await handleScannedText(member, frame);
    const messageRelayed = await preparePacketForQr(member, message.id);

    // An ACK that expired yesterday: created with the member's clock two days back,
    // then removed so the valid ACK below can be created.
    member.advance(-2 * DURATIONS.day);
    const expiredAck = await createAcknowledgement(member, message.id);
    member.advance(2 * DURATIONS.day);
    await member.db.packets.delete(expiredAck.id);
    await member.db.acknowledgements.delete(expiredAck.packetId);
    const ack = await createAcknowledgement(member, message.id);

    const memberMessage = await composeMessage(member, community.id, memberMessageText);
    const expiredMessage = await buildExpiredFixture(admin, community.id);
    const other = await createCommunity(admin, "Other Group");
    const otherCommunityMessage = await composeMessage(admin, other.id, "Not for Campus Volunteers.");
    const groupKey = bytesToB64u(await unwrapGroupKeyBytes(admin, community.id, community.keyEpoch));

    // Invalid vectors derived from the valid ones.
    const env = decodePayload(message.encodedEnvelope) as PacketEnvelope;
    const changed = (edit: (e: PacketEnvelope) => void) => {
      const copy = structuredClone(env);
      edit(copy);
      return encodeRaw(copy);
    };
    const request = decodePayload(pending.requestPayload!) as JoinRequestPayload;
    const approval = decodePayload(joinApproval) as JoinApprovalPayload;
    const [frame0, frame1] = messageFrames as [string, string, ...string[]];

    const invalid: InvalidVector[] = [
      { name: "frame with unknown prefix", receiver: "member", frames: [frame0.replace(/^C1:/, "C2:")], error: "FRAME_INVALID" },
      {
        name: "frame index outside the transfer",
        receiver: "member",
        frames: [frame0.split(":").map((p, i) => (i === 2 ? "9" : p)).join(":")],
        error: "FRAME_INVALID",
      },
      {
        name: "same frame index with different content",
        receiver: "member",
        frames: [frame0, withChunk(frame0, (c) => flipChar(c))],
        error: "FRAME_CONFLICT",
      },
      {
        name: "one character changed in a frame",
        receiver: "member",
        frames: messageFrames.map((f) => (f === frame1 ? withChunk(f, (c) => flipChar(c)) : f)),
        error: "TRANSFER_DIGEST_MISMATCH",
      },
      { name: "unsupported protocol version", receiver: "member", payload: changed((e) => Object.assign(e, { v: 2 })), error: "UNSUPPORTED_VERSION" },
      { name: "unknown packet type", receiver: "member", payload: changed((e) => Object.assign(e, { type: "FILE" })), error: "PACKET_SCHEMA_INVALID" },
      { name: "payload is not JSON", receiver: "member", payload: bytesToB64u(utf8Encode("not json")), error: "PACKET_SCHEMA_INVALID" },
      { name: "ciphertext altered", receiver: "member", payload: changed((e) => (e.ciphertext = flipChar(e.ciphertext))), error: "SIGNATURE_INVALID" },
      { name: "signed header altered", receiver: "member", payload: changed((e) => (e.expiresAt += 1)), error: "SIGNATURE_INVALID" },
      {
        name: "membership certificate altered",
        receiver: "member",
        payload: changed((e) => (e.memberCertificate.body.displayName = "Mallory")),
        error: "CERTIFICATE_INVALID",
      },
      {
        name: "sender is not the certified member",
        receiver: "member",
        payload: changed((e) => (e.senderId = memberIdentity.memberId)),
        error: "CERTIFICATE_INVALID",
      },
      { name: "unknown key epoch", receiver: "member", payload: changed((e) => (e.keyEpoch = 2)), error: "KEY_EPOCH_MISMATCH" },
      { name: "relay limit reached", receiver: "member", payload: changed((e) => (e.relay.hopCount = e.maxHops)), error: "RELAY_LIMIT_REACHED" },
      { name: "expired message", receiver: "member", payload: expiredMessage, error: "PACKET_EXPIRED" },
      { name: "message from another community", receiver: "member", payload: otherCommunityMessage.encodedEnvelope, error: "UNKNOWN_COMMUNITY" },
      { name: "expired acknowledgement", receiver: "admin", payload: expiredAck.encodedEnvelope, error: "PACKET_EXPIRED" },
      {
        name: "join request with the wrong invite secret",
        receiver: "admin",
        payload: encodeRaw({ ...request, inviteSecret: flipChar(request.inviteSecret) }),
        error: "JOIN_REQUEST_INVALID",
      },
      {
        name: "approval with an altered wrapped key",
        receiver: "pendingMember",
        payload: encodeRaw({ ...approval, wrappedGroupKey: flipChar(approval.wrappedGroupKey) }),
        error: "JOIN_APPROVAL_INVALID",
      },
      {
        name: "approval for another device",
        receiver: "pendingMember",
        payload: encodeRaw({ ...approval, memberId: flipChar(approval.memberId) }),
        error: "JOIN_APPROVAL_INVALID",
      },
    ];

    const vectors: GoldenVectors = {
      protocol: "CARRY/1",
      description:
        "Golden vectors for PACKET_PROTOCOL.md §14, generated by scripts/generate-vectors.ts. Keys are test-only. Do not edit or regenerate for protocol v1.",
      generatedAt: T0,
      verifyAt: T0 + 5 * DURATIONS.minute,
      keys: { groupKey, memberRequestEcdhPrivateJwk },
      context: {
        communityId: community.id,
        communityName: community.name,
        keyEpoch: community.keyEpoch,
        adminMemberId: adminIdentity.memberId,
        adminDisplayName: adminIdentity.displayName,
        memberId: memberIdentity.memberId,
        memberDisplayName: memberIdentity.displayName,
        inviteId: created.invite.id,
        inviteSecretHash: created.invite.secretHash,
        inviteCreatedAt: created.invite.createdAt,
        inviteExpiresAt: created.invite.expiresAt,
        joinRequestExpiresAt: pending.expiresAt,
        messageText,
        memberMessageText,
      },
      valid: {
        invite: created.encoded,
        joinRequest: pending.requestPayload!,
        joinApproval,
        message: message.encodedEnvelope,
        messageFrames,
        messageRelayed,
        ack: ack.encodedEnvelope,
        memberMessage: memberMessage.encodedEnvelope,
      },
      invalid,
    };

    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, `${JSON.stringify(vectors, null, 2)}\n`);
  } finally {
    delete (subtle as { generateKey?: unknown }).generateKey;
  }
}, 60_000);
