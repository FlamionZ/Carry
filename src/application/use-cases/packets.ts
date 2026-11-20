import { canonicalJson, packetAad, type PacketHeader } from "../../domain/canonical";
import {
  b64uToBytes,
  type Bytes,
  bytesToB64u,
  concatBytes,
  randomId,
  utf8Decode,
  utf8Encode,
} from "../../domain/encoding";
import { CarryError, isCarryError } from "../../domain/errors";
import { DURATIONS, LIMITS } from "../../domain/limits";
import { isJourneyRecorded } from "../../domain/packet/relay";
import {
  assertImportable,
  effectiveStatus,
  nextRelayHop,
  packetRecordId,
  prepareRelay,
  type ShareState,
  shareState,
  type StatusLabel,
  statusLabel,
} from "../../domain/packet/rules";
import {
  type AckBody,
  ackBodySchema,
  type MemberCertificate,
  type MessageBody,
  messageBodySchema,
  type MessageKind,
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
import { describeRelayJourney, type RelayJourney, signRelayEntry, verifyRelayEntries } from "./relay";

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

/** The schema checks only the Base64URL alphabet; non-canonical padding bits are malformed packets. */
function envelopeBytes(field: string): Bytes {
  try {
    return b64uToBytes(field);
  } catch {
    throw new CarryError("PACKET_SCHEMA_INVALID");
  }
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
  await verifyEnvelope(device, env);
  return decryptEnvelope(device, env);
}

/** Community, key epoch, admin certificate and sender signature (§7). Nothing is decrypted. */
async function verifyEnvelope(device: Device, env: PacketEnvelope): Promise<void> {
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
  const nonce = envelopeBytes(env.nonce);
  const ciphertext = envelopeBytes(env.ciphertext);
  const certHash = await certificateHash(cert);
  const ok = await verify(
    cert.body.signingPublicJwk,
    env.senderSignature,
    signatureInput(aad, nonce, ciphertext, certHash),
  );
  if (!ok) throw new CarryError("SIGNATURE_INVALID");
}

/** Decrypts and validates the body. Call only after `verifyEnvelope`. */
async function decryptEnvelope(device: Device, env: PacketEnvelope): Promise<OpenedPacket> {
  const cert = env.memberCertificate;
  const aad = utf8Encode(packetAad(headerOf(env)));
  const nonce = envelopeBytes(env.nonce);
  const ciphertext = envelopeBytes(env.ciphertext);
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

/** This build always writes `kind`, including for Announcements (PACKET_PROTOCOL.md §5). */
export async function composeMessage(
  device: Device,
  communityId: string,
  rawText: string,
  kind: MessageKind = "ANNOUNCEMENT",
): Promise<PacketRecord> {
  const text = normalizeMessageText(rawText);
  const { envelope, encoded } = await buildEnvelope(device, communityId, "MESSAGE", { text, replyTo: null, kind });
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
/** A MESSAGE this device wrote: the only kind of packet an ACK can mark Acknowledged here. */
function isOwnMessage(record: PacketRecord, myMemberId: string): boolean {
  return record.direction === "OUTBOUND" && record.packetType === "MESSAGE" && record.senderId === myMemberId;
}

export async function importPacket(device: Device, env: PacketEnvelope, transferId?: string): Promise<ImportResult> {
  assertImportable(env, device.now());
  await verifyEnvelope(device, env);
  // Relay entries: after the sender signature, before decryption (§11A).
  await verifyRelayEntries(device, env, env.relay, device.now());
  const opened = await decryptEnvelope(device, env);
  const { db } = device;
  const id = packetRecordId(env.communityId, env.packetId);
  const encoded = encodePayload(env);
  const identity = await requireIdentity(device);

  const ackBody = env.type === "ACK" ? (opened.body as AckBody) : undefined;
  const originalRecordId = ackBody ? packetRecordId(env.communityId, ackBody.originalPacketId) : undefined;

  // §10: only the author re-verifies the copied journey, against its own
  // stored message. Other devices carry the copy unchecked.
  if (ackBody?.messageRelay && originalRecordId) {
    const original = await db.packets.get(originalRecordId);
    if (original && isOwnMessage(original, identity.memberId)) {
      await verifyRelayEntries(device, storedEnvelope(original), ackBody.messageRelay, device.now());
    }
  }

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
        acknowledgedOwn = !!original && isOwnMessage(original, identity.memberId);
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
    if (record.firstShownAt === undefined) {
      await db.transaction("rw", db.packets, db.auditEvents, async () => {
        const current = await db.packets.get(recordId);
        if (current && current.firstShownAt === undefined) {
          await db.packets.update(recordId, { firstShownAt: now, lastActionAt: now });
          await auditEvent(device, "PACKET_SHOWN", record.packetId, record.communityId);
        }
      });
    }
    return record.encodedEnvelope;
  }

  // Sign before the transaction (no non-Dexie awaits inside it). An
  // unrecorded journey gets no entry, so it stays consistent with §11A rule 1.
  const hop = nextRelayHop(env, now);
  const entry = isJourneyRecorded(env.relay) ? await signRelayEntry(device, env, env.relay, hop) : undefined;
  const relayed = prepareRelay(env, now, entry);
  let encoded: string;
  try {
    encoded = encodePayload(relayed);
  } catch (err) {
    // No room left for this relay's entry within the payload limit (§11A, size).
    if (isCarryError(err, "PAYLOAD_TOO_LARGE")) throw new CarryError("RELAY_LIMIT_REACHED");
    throw err;
  }
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

/**
 * Copies the message's relay section exactly as stored into the encrypted
 * ACK body (§10). If the ACK would then exceed the payload limit, the copy is
 * left out and the author shows the outbound journey as not reported.
 */
async function buildAckEnvelope(device: Device, communityId: string, originalPacketId: string, message: PacketEnvelope) {
  const base: AckBody = { originalPacketId, ackStatus: "RECEIVED" };
  const { hopCount, entries } = message.relay;
  const messageRelay = entries === undefined ? { hopCount } : { hopCount, entries };
  try {
    return await buildEnvelope(device, communityId, "ACK", { ...base, messageRelay });
  } catch (err) {
    if (!isCarryError(err, "PAYLOAD_TOO_LARGE")) throw err;
    return buildEnvelope(device, communityId, "ACK", base);
  }
}

export async function createAcknowledgement(device: Device, messageRecordId: string): Promise<PacketRecord> {
  const { db } = device;
  const message = await db.packets.get(messageRecordId);
  if (!message || message.packetType !== "MESSAGE") throw new CarryError("NOT_FOUND");
  if (message.direction !== "INBOUND") {
    throw new CarryError("INPUT_INVALID", "You can only acknowledge messages received from someone else.");
  }
  // Re-verify before acknowledging.
  const messageEnvelope = storedEnvelope(message);
  await openEnvelope(device, messageEnvelope);

  const existing = (await db.packets.where("originalPacketId").equals(message.packetId).toArray()).find(
    (p) => p.direction === "OUTBOUND" && p.communityId === message.communityId,
  );
  if (existing) return existing;

  const identity = await requireIdentity(device);
  const { envelope, encoded } = await buildAckEnvelope(device, message.communityId, message.packetId, messageEnvelope);
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
  /** The glossary word for what this device has observed. */
  statusLabel: StatusLabel;
  share: ShareState;
  senderName: string;
  senderRole: MembershipRecord["role"];
  /** MESSAGE only. */
  text?: string;
  /** MESSAGE only. A body without `kind` reads as ANNOUNCEMENT. */
  messageKind?: MessageKind;
  /** ACK only. */
  original?: OriginalMessage;
  /**
   * INBOUND only: how this packet reached this device, from its relay entries
   * and the members this device knows now. The author's own packets have none.
   */
  journey?: RelayJourney;
  /** The author's own MESSAGE only: each acknowledgement scanned on this device, oldest first. */
  acknowledgements?: ReturnedAcknowledgement[];
}

/** An acknowledgement that came back to the author, with both journeys (§10). */
export interface ReturnedAcknowledgement {
  ackRecordId: string;
  acknowledgedBy: string;
  acknowledgedByName: string;
  /** The ACK's createdAt, by the acknowledging member's clock. */
  ackCreatedAt: number;
  /** When this device scanned the ACK. */
  receivedAt: number;
  /** How the message reached the acknowledging member. Undefined when the ACK did not report it. */
  outbound?: RelayJourney;
  /** How the ACK came back to this device, from its own relay entries. */
  back: RelayJourney;
}

async function describeReturnedAcknowledgements(
  device: Device,
  message: PacketEnvelope,
): Promise<ReturnedAcknowledgement[]> {
  const acks = (await device.db.acknowledgements.where("originalPacketId").equals(message.packetId).toArray())
    .filter((a) => a.communityId === message.communityId && a.receivedAt !== null)
    .sort((a, b) => a.receivedAt! - b.receivedAt!);
  const out: ReturnedAcknowledgement[] = [];
  for (const ack of acks) {
    const record = await device.db.packets.get(packetRecordId(ack.communityId, ack.ackPacketId));
    if (!record || record.packetType !== "ACK") continue;
    const env = storedEnvelope(record);
    let body: AckBody;
    try {
      body = (await openEnvelope(device, env)).body as AckBody;
    } catch {
      // The ACK can no longer be verified here (e.g. a later key epoch): show no journeys for it.
      continue;
    }
    // Clock flags use the time this device scanned the ACK, for both journeys.
    const scannedAt = record.firstSeenAt;
    out.push({
      ackRecordId: record.id,
      acknowledgedBy: ack.acknowledgedBy,
      acknowledgedByName: ack.acknowledgedByName,
      ackCreatedAt: env.createdAt,
      receivedAt: ack.receivedAt!,
      outbound: body.messageRelay
        ? await describeRelayJourney(device, message, body.messageRelay, scannedAt)
        : undefined,
      back: await describeRelayJourney(device, env, env.relay, scannedAt),
    });
  }
  return out;
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
    statusLabel: statusLabel(record, now),
    share: shareState(record.direction, envelope, now),
    senderName: opened.certificate.body.displayName,
    senderRole: opened.certificate.body.role,
  };
  if (envelope.type === "MESSAGE") {
    const body = opened.body as MessageBody;
    view.text = body.text;
    view.messageKind = body.kind ?? "ANNOUNCEMENT";
  } else {
    view.original = await describeOriginal(device, record.communityId, (opened.body as AckBody).originalPacketId);
  }
  if (record.direction === "INBOUND") {
    // Clock flags compare against the time this device scanned the packet.
    view.journey = await describeRelayJourney(device, envelope, envelope.relay, record.firstSeenAt);
  } else if (envelope.type === "MESSAGE") {
    view.acknowledgements = await describeReturnedAcknowledgements(device, envelope);
  }
  return view;
}
