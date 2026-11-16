import { canonicalJson, packetAad, type PacketHeader } from "../../domain/canonical";
import { b64uToBytes, bytesToB64u, concatBytes, randomId, utf8Decode, utf8Encode } from "../../domain/encoding";
import { CarryError } from "../../domain/errors";
import { DURATIONS, LIMITS } from "../../domain/limits";
import {
  assertImportable,
  effectiveStatus,
  packetRecordId,
  prepareRelay,
  type ShareState,
  shareState,
} from "../../domain/packet/rules";
import {
  type AckBody,
  ackBodySchema,
  type MemberCertificate,
  type MessageBody,
  messageBodySchema,
  type PacketEnvelope,
} from "../../domain/packet/schemas";
import type { AcknowledgementRecord, MembershipRecord, PacketRecord } from "../../infrastructure/db/db";
import { aesDecrypt, aesEncrypt, newNonce, sign, verify } from "../../infrastructure/crypto/webcrypto";
import { auditEvent } from "../audit";
import { decodePayload, encodePayload } from "../codec";
import type { Device } from "../device";
import { assertCertificate, certificateHash } from "./certificates";
import { requireIdentity } from "./identity";
import { loadGroupKey } from "./keys";

function signatureInput(aad: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array, certHash: Uint8Array) {
  return concatBytes(aad, nonce, ciphertext, certHash);
}

function headerOf(env: PacketEnvelope): PacketHeader {
  return {
    type: env.type,
    communityId: env.communityId,
    packetId: env.packetId,
    keyEpoch: env.keyEpoch,
    senderId: env.senderId,
    createdAt: env.createdAt,
    expiresAt: env.expiresAt,
    maxHops: env.maxHops,
  };
}

export interface BuildOptions {
  /** Override creation time (used for clearly-labelled expired test fixtures). */
  createdAt?: number;
  ttlMs?: number;
  maxHops?: number;
}

/** Encrypts (AES-256-GCM) and signs (ECDSA P-256) a MESSAGE or ACK envelope. */
async function buildEnvelope(
  device: Device,
  communityId: string,
  type: "MESSAGE" | "ACK",
  body: MessageBody | AckBody,
  opts: BuildOptions = {},
): Promise<{ envelope: PacketEnvelope; encoded: string }> {
  const community = await device.db.communities.get(communityId);
  if (!community) throw new CarryError("UNKNOWN_COMMUNITY");
  const identity = await requireIdentity(device);
  const membership = await device.db.memberships.get(`${communityId}:${identity.memberId}`);
  if (!membership || membership.status !== "ACTIVE") throw new CarryError("UNKNOWN_COMMUNITY");

  const createdAt = opts.createdAt ?? device.now();
  const header: PacketHeader = {
    type,
    communityId,
    packetId: randomId(16),
    keyEpoch: community.keyEpoch,
    senderId: identity.memberId,
    createdAt,
    expiresAt: createdAt + (opts.ttlMs ?? DURATIONS.messageTtl),
    maxHops: opts.maxHops ?? LIMITS.maxHopsDefault,
  };
  const aad = utf8Encode(packetAad(header));
  const nonce = newNonce();
  const key = await loadGroupKey(device, communityId, community.keyEpoch);
  const ciphertext = await aesEncrypt(key, nonce, utf8Encode(canonicalJson(body)), aad);

  const cert: MemberCertificate = { body: membership.certificateBody, adminSignature: membership.adminSignature };
  const certHash = await certificateHash(cert);
  const senderSignature = await sign(identity.signingPrivateKey, signatureInput(aad, nonce, ciphertext, certHash));

  const envelope: PacketEnvelope = {
    v: 1,
    ...header,
    nonce: bytesToB64u(nonce),
    ciphertext: bytesToB64u(ciphertext),
    memberCertificate: cert,
    senderSignature,
    relay: { hopCount: 0 },
  };
  return { envelope, encoded: encodePayload(envelope) };
}

export interface OpenedPacket {
  body: MessageBody | AckBody;
  certificate: MemberCertificate;
}

/**
 * Verifies community, key epoch, admin certificate and sender signature, then
 * decrypts. Content is returned only if every check passes.
 */
export async function openEnvelope(device: Device, env: PacketEnvelope): Promise<OpenedPacket> {
  const community = await device.db.communities.get(env.communityId);
  if (!community) throw new CarryError("UNKNOWN_COMMUNITY");
  if (env.keyEpoch !== community.keyEpoch) throw new CarryError("KEY_EPOCH_MISMATCH");

  const cert = env.memberCertificate;
  await assertCertificate(cert, community.adminSigningPublicJwk, {
    communityId: env.communityId,
    keyEpoch: env.keyEpoch,
    memberId: env.senderId,
  });

  const aad = utf8Encode(packetAad(headerOf(env)));
  const nonce = b64uToBytes(env.nonce);
  const ciphertext = b64uToBytes(env.ciphertext);
  const certHash = await certificateHash(cert);
  const ok = await verify(
    cert.body.signingPublicJwk,
    env.senderSignature,
    signatureInput(aad, nonce, ciphertext, certHash),
  );
  if (!ok) throw new CarryError("SIGNATURE_INVALID");

  const key = await loadGroupKey(device, env.communityId, env.keyEpoch);
  const plaintext = await aesDecrypt(key, nonce, ciphertext, aad);
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8Decode(plaintext));
  } catch {
    throw new CarryError("PACKET_SCHEMA_INVALID");
  }
  const result = env.type === "MESSAGE" ? messageBodySchema.safeParse(parsed) : ackBodySchema.safeParse(parsed);
  if (!result.success) throw new CarryError("PACKET_SCHEMA_INVALID");
  return { body: result.data, certificate: cert };
}

function outboundRecord(device: Device, env: PacketEnvelope, encoded: string, originalPacketId?: string): PacketRecord {
  const now = device.now();
  return {
    id: packetRecordId(env.communityId, env.packetId),
    communityId: env.communityId,
    packetId: env.packetId,
    packetType: env.type,
    encodedEnvelope: encoded,
    direction: "OUTBOUND",
    status: "READY",
    hopCount: 0,
    senderId: env.senderId,
    createdAt: env.createdAt,
    expiresAt: env.expiresAt,
    firstSeenAt: now,
    lastActionAt: now,
    originalPacketId,
  };
}

// ── ComposeMessage ────────────────────────────────────────────────────────

export function normalizeMessageText(raw: string): string {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (text.length < 1) throw new CarryError("INPUT_INVALID", "Write a message first.");
  if (text.length > LIMITS.maxMessageLength) {
    throw new CarryError("INPUT_INVALID", `Messages can be up to ${LIMITS.maxMessageLength} characters.`);
  }
  return text;
}

export async function composeMessage(device: Device, communityId: string, rawText: string): Promise<PacketRecord> {
  const text = normalizeMessageText(rawText);
  const { envelope, encoded } = await buildEnvelope(device, communityId, "MESSAGE", { text, replyTo: null });
  const record = outboundRecord(device, envelope, encoded);
  const { db } = device;
  await db.transaction("rw", db.packets, db.auditEvents, async () => {
    await db.packets.add(record);
    await auditEvent(device, "PACKET_CREATED", envelope.packetId, communityId, { type: "MESSAGE" });
  });
  return record;
}

/**
 * Builds a validly signed MESSAGE whose expiry is already in the past. It is
 * not stored. Used only by the labelled integrity test in Settings.
 */
export async function buildExpiredFixture(device: Device, communityId: string): Promise<string> {
  const createdAt = device.now() - 2 * DURATIONS.day;
  const { encoded } = await buildEnvelope(
    device,
    communityId,
    "MESSAGE",
    { text: "[Test fixture] This packet expired yesterday.", replyTo: null },
    { createdAt, ttlMs: DURATIONS.day },
  );
  return encoded;
}

// ── AcceptPacket (import) ─────────────────────────────────────────────────

export interface ImportResult {
  record: PacketRecord;
  /** For ACKs: true when this device sent the acknowledged message. */
  acknowledgedOwn: boolean;
  originalRecordId?: string;
}

/**
 * Validates and stores a received MESSAGE/ACK. Duplicates (same community +
 * packet ID) never create another entry; they throw PACKET_DUPLICATE.
 */
export async function importPacket(device: Device, env: PacketEnvelope, transferId?: string): Promise<ImportResult> {
  assertImportable(env, device.now());
  const opened = await openEnvelope(device, env);
  const { db } = device;
  const id = packetRecordId(env.communityId, env.packetId);
  const encoded = encodePayload(env);
  const identity = await requireIdentity(device);

  const ackBody = env.type === "ACK" ? (opened.body as AckBody) : undefined;
  const originalRecordId = ackBody ? packetRecordId(env.communityId, ackBody.originalPacketId) : undefined;

  let result: ImportResult | undefined;
  let duplicate = false;
  await db.transaction(
    "rw",
    [db.packets, db.memberships, db.acknowledgements, db.transfers, db.auditEvents],
    async () => {
      const now = device.now();
      // The transfer is finished together with the packet commit.
      if (transferId) await db.transfers.delete(transferId);

      const existing = await db.packets.get(id);
      if (existing) {
        await db.packets.update(id, { lastActionAt: now });
        await auditEvent(device, "PACKET_DUPLICATE", env.packetId, env.communityId);
        duplicate = true;
        return;
      }

      const record: PacketRecord = {
        id,
        communityId: env.communityId,
        packetId: env.packetId,
        packetType: env.type,
        encodedEnvelope: encoded,
        direction: "INBOUND",
        status: "IMPORTED",
        hopCount: env.relay.hopCount,
        senderId: env.senderId,
        createdAt: env.createdAt,
        expiresAt: env.expiresAt,
        firstSeenAt: now,
        lastActionAt: now,
        originalPacketId: ackBody?.originalPacketId,
      };
      await db.packets.add(record);

      // Remember verified members we learn about from their certificates.
      const cert = opened.certificate;
      const membershipId = `${env.communityId}:${cert.body.memberId}`;
      if (!(await db.memberships.get(membershipId))) {
        const membership: MembershipRecord = {
          id: membershipId,
          communityId: env.communityId,
          memberId: cert.body.memberId,
          displayName: cert.body.displayName,
          role: cert.body.role,
          signingPublicJwk: cert.body.signingPublicJwk,
          certificateBody: cert.body,
          adminSignature: cert.adminSignature,
          joinedAt: cert.body.issuedAt,
          status: "ACTIVE",
        };
        await db.memberships.add(membership);
      }

      let acknowledgedOwn = false;
      if (ackBody && originalRecordId) {
        const original = await db.packets.get(originalRecordId);
        acknowledgedOwn =
          !!original &&
          original.direction === "OUTBOUND" &&
          original.packetType === "MESSAGE" &&
          original.senderId === identity.memberId;
        if (acknowledgedOwn) {
          await db.packets.update(originalRecordId, { status: "ACKNOWLEDGED", lastActionAt: now });
        }
        const ack: AcknowledgementRecord = {
          id: env.packetId,
          communityId: env.communityId,
          originalPacketId: ackBody.originalPacketId,
          ackPacketId: env.packetId,
          acknowledgedBy: env.senderId,
          acknowledgedByName: cert.body.displayName,
          createdAt: env.createdAt,
          receivedAt: acknowledgedOwn ? now : null,
        };
        await db.acknowledgements.put(ack);
      }
      await auditEvent(device, "PACKET_IMPORTED", env.packetId, env.communityId, {
        type: env.type,
        hopCount: env.relay.hopCount,
      });
      result = { record, acknowledgedOwn, originalRecordId };
    },
  );
  // Reported after the last-seen update has committed.
  if (duplicate) throw new CarryError("PACKET_DUPLICATE", undefined, { recordId: id });
  if (!result) throw new CarryError("STORAGE_ERROR");
  return result;
}

// ── Relay / share ─────────────────────────────────────────────────────────

/**
 * Returns the payload to display as QR frames. Outbound packets are shown as
 * created. Inbound packets are relayed with hopCount + 1; header, ciphertext
 * and signatures are unchanged.
 */
export async function preparePacketForQr(device: Device, recordId: string): Promise<string> {
  const { db } = device;
  const record = await db.packets.get(recordId);
  if (!record) throw new CarryError("NOT_FOUND");
  const env = storedEnvelope(record);
  const now = device.now();

  if (record.direction === "OUTBOUND") {
    if (now >= env.expiresAt) throw new CarryError("PACKET_EXPIRED");
    return record.encodedEnvelope;
  }

  const relayed = prepareRelay(env, now);
  const encoded = encodePayload(relayed);
  await db.transaction("rw", db.packets, db.auditEvents, async () => {
    const current = await db.packets.get(recordId);
    if (current && current.status === "IMPORTED") {
      await db.packets.update(recordId, { status: "RELAYED", lastActionAt: now });
    }
    await auditEvent(device, "PACKET_RELAYED", record.packetId, record.communityId, {
      hopCount: relayed.relay.hopCount,
    });
  });
  return encoded;
}

// ── CreateAcknowledgement ─────────────────────────────────────────────────

export async function createAcknowledgement(device: Device, messageRecordId: string): Promise<PacketRecord> {
  const { db } = device;
  const message = await db.packets.get(messageRecordId);
  if (!message || message.packetType !== "MESSAGE") throw new CarryError("NOT_FOUND");
  if (message.direction !== "INBOUND") {
    throw new CarryError("INPUT_INVALID", "You can only acknowledge messages received from someone else.");
  }
  // Re-verify before acknowledging.
  await openEnvelope(device, storedEnvelope(message));

  const existing = (await db.packets.where("originalPacketId").equals(message.packetId).toArray()).find(
    (p) => p.direction === "OUTBOUND" && p.communityId === message.communityId,
  );
  if (existing) return existing;

  const identity = await requireIdentity(device);
  const { envelope, encoded } = await buildEnvelope(device, message.communityId, "ACK", {
    originalPacketId: message.packetId,
    ackStatus: "RECEIVED",
  });
  const record = outboundRecord(device, envelope, encoded, message.packetId);
  const membership = await db.memberships.get(`${message.communityId}:${identity.memberId}`);
  await db.transaction("rw", [db.packets, db.acknowledgements, db.auditEvents], async () => {
    await db.packets.add(record);
    await db.acknowledgements.put({
      id: envelope.packetId,
      communityId: message.communityId,
      originalPacketId: message.packetId,
      ackPacketId: envelope.packetId,
      acknowledgedBy: identity.memberId,
      acknowledgedByName: membership?.displayName ?? identity.displayName,
      createdAt: envelope.createdAt,
      receivedAt: null,
    });
    await auditEvent(device, "ACK_CREATED", envelope.packetId, message.communityId);
  });
  return record;
}

// ── Read for display ──────────────────────────────────────────────────────

/** Decode a stored envelope. Stored data is re-validated like any other input. */
export function storedEnvelope(record: PacketRecord): PacketEnvelope {
  const payload = decodePayload(record.encodedEnvelope);
  if (payload.type !== "MESSAGE" && payload.type !== "ACK") throw new CarryError("PACKET_SCHEMA_INVALID");
  return payload;
}

/** True when this device can show the packet as QR right now (relay queue). No decryption needed. */
export function canShareRecord(record: PacketRecord, now: number): boolean {
  if (record.status === "REJECTED") return false;
  try {
    return shareState(record.direction, storedEnvelope(record), now) === "OK";
  } catch {
    return false;
  }
}

/** The message an ACK refers to, if that message is on this device. */
export interface OriginalMessage {
  packetId: string;
  recordId: string;
  found: boolean;
  outbound: boolean;
  senderName?: string;
  text?: string;
}

export interface PacketView {
  record: PacketRecord;
  envelope: PacketEnvelope;
  status: PacketRecord["status"];
  share: ShareState;
  senderName: string;
  senderRole: MembershipRecord["role"];
  /** MESSAGE only. */
  text?: string;
  /** ACK only. */
  original?: OriginalMessage;
}

async function describeOriginal(device: Device, communityId: string, packetId: string): Promise<OriginalMessage> {
  const recordId = packetRecordId(communityId, packetId);
  const ref: OriginalMessage = { packetId, recordId, found: false, outbound: false };
  const original = await device.db.packets.get(recordId);
  if (!original || original.packetType !== "MESSAGE") return ref;
  ref.found = true;
  ref.outbound = original.direction === "OUTBOUND";
  try {
    const opened = await openEnvelope(device, storedEnvelope(original));
    ref.senderName = opened.certificate.body.displayName;
    ref.text = (opened.body as MessageBody).text;
  } catch {
    // The original can no longer be verified here; show the ACK without its text.
  }
  return ref;
}

/** Re-verifies and decrypts a stored envelope for display. Plaintext is not persisted. */
export async function readPacket(device: Device, recordId: string): Promise<PacketView> {
  const record = await device.db.packets.get(recordId);
  if (!record) throw new CarryError("NOT_FOUND");
  const envelope = storedEnvelope(record);
  const opened = await openEnvelope(device, envelope);
  const now = device.now();
  const view: PacketView = {
    record,
    envelope,
    status: effectiveStatus(record.status, record.expiresAt, now),
    share: shareState(record.direction, envelope, now),
    senderName: opened.certificate.body.displayName,
    senderRole: opened.certificate.body.role,
  };
  if (envelope.type === "MESSAGE") {
    view.text = (opened.body as MessageBody).text;
  } else {
    view.original = await describeOriginal(device, record.communityId, (opened.body as AckBody).originalPacketId);
  }
  return view;
}
