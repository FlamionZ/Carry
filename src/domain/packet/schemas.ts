import { z } from "zod";
import { BASE64URL_RE, b64uLength } from "../encoding";
import { CarryError } from "../errors";
import { LIMITS } from "../limits";

// Zod's JIT compiles parsers with `new Function`, which the app's CSP forbids
// (no 'unsafe-eval'); its probe for that is itself reported as a CSP violation.
// Must run before any schema below is created.
z.config({ jitless: true });

/** Base64URL string that decodes to exactly `bytes` bytes. */
const b64uBytes = (bytes: number) =>
  z
    .string()
    .length(b64uLength(bytes))
    .regex(BASE64URL_RE, "Invalid Base64URL");

const b64uBounded = (maxChars: number) => z.string().min(1).max(maxChars).regex(BASE64URL_RE, "Invalid Base64URL");

export const id16 = b64uBytes(16);
export const id12 = b64uBytes(12);
const nonce12 = b64uBytes(12);
const salt16 = b64uBytes(16);
/** ECDSA P-256 IEEE-P1363 signature = 64 bytes. */
const signature = b64uBytes(64);
const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000);
const keyEpoch = z.number().int().min(1).max(1_000_000);
/**
 * 1–40 chars, no surrounding whitespace, no control characters. Validated
 * without transforms so signed values are checked exactly as they were signed.
 */
const displayName = z
  .string()
  .min(1)
  .max(LIMITS.maxNameLength)
  .refine((s) => s.trim() === s && !/\p{Cc}/u.test(s), "Invalid display name");

export const publicJwkSchema = z.object({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: b64uBytes(32),
  y: b64uBytes(32),
});
export type PublicJwk = z.infer<typeof publicJwkSchema>;

export const roleSchema = z.enum(["ADMIN", "MEMBER"]);
export type Role = z.infer<typeof roleSchema>;

export const certificateBodySchema = z.object({
  v: z.literal(1),
  communityId: id16,
  memberId: id16,
  displayName,
  role: roleSchema,
  keyEpoch,
  signingPublicJwk: publicJwkSchema,
  issuedAt: timestamp,
});
export type CertificateBody = z.infer<typeof certificateBodySchema>;

export const memberCertificateSchema = z.object({
  body: certificateBodySchema,
  adminSignature: signature,
});
export type MemberCertificate = z.infer<typeof memberCertificateSchema>;

/** A relay's signed statement that it carried the packet one hop (PACKET_PROTOCOL.md §11A). */
export const relayEntrySchema = z.object({
  memberId: id16,
  hop: z.number().int().min(1).max(255),
  at: timestamp,
  sig: signature,
});
export type RelayEntry = z.infer<typeof relayEntrySchema>;

/** The mutable, unsigned-by-the-author part of a packet: hop count and relay entries. */
export const relaySectionSchema = z.object({
  hopCount: z.number().int().min(0).max(255),
  entries: z.array(relayEntrySchema).max(LIMITS.maxHopsLimit).optional(),
});
export type RelaySection = z.infer<typeof relaySectionSchema>;

export const packetEnvelopeSchema = z.object({
  v: z.literal(1),
  type: z.enum(["MESSAGE", "ACK"]),
  communityId: id16,
  packetId: id16,
  keyEpoch,
  senderId: id16,
  createdAt: timestamp,
  expiresAt: timestamp,
  maxHops: z.number().int().min(1).max(LIMITS.maxHopsLimit),
  nonce: nonce12,
  ciphertext: b64uBounded(LIMITS.maxPayload),
  memberCertificate: memberCertificateSchema,
  senderSignature: signature,
  relay: relaySectionSchema,
});
export type PacketEnvelope = z.infer<typeof packetEnvelopeSchema>;

export const messageBodySchema = z.object({
  text: z.string().min(1).max(LIMITS.maxMessageLength),
  replyTo: id16.nullable(),
});
export type MessageBody = z.infer<typeof messageBodySchema>;

export const ackBodySchema = z.object({
  originalPacketId: id16,
  ackStatus: z.literal("RECEIVED"),
});
export type AckBody = z.infer<typeof ackBodySchema>;

export const invitePayloadSchema = z.object({
  v: z.literal(1),
  type: z.literal("INVITE"),
  communityId: id16,
  communityName: displayName,
  inviteId: id16,
  inviteSecret: id16,
  expiresAt: timestamp,
  adminSigningPublicJwk: publicJwkSchema,
  adminEphemeralEcdhPublicJwk: publicJwkSchema,
  adminFingerprint: z.string().min(8).max(64),
});
export type InvitePayload = z.infer<typeof invitePayloadSchema>;

export const joinRequestPayloadSchema = z.object({
  v: z.literal(1),
  type: z.literal("JOIN_REQUEST"),
  communityId: id16,
  inviteId: id16,
  inviteSecret: id16,
  memberId: id16,
  displayName,
  memberSigningPublicJwk: publicJwkSchema,
  memberEphemeralEcdhPublicJwk: publicJwkSchema,
  requestNonce: id16,
  requestedAt: timestamp,
});
export type JoinRequestPayload = z.infer<typeof joinRequestPayloadSchema>;

export const joinApprovalPayloadSchema = z.object({
  v: z.literal(1),
  type: z.literal("JOIN_APPROVAL"),
  communityId: id16,
  inviteId: id16,
  memberId: id16,
  keyEpoch,
  certificateBody: certificateBodySchema,
  certificateSignature: signature,
  hkdfSalt: salt16,
  wrapNonce: nonce12,
  // 32-byte group key + 16-byte GCM tag = 48 bytes
  wrappedGroupKey: b64uBytes(48),
  approvalSignature: signature,
});
export type JoinApprovalPayload = z.infer<typeof joinApprovalPayloadSchema>;

export type CarryPayload = InvitePayload | JoinRequestPayload | JoinApprovalPayload | PacketEnvelope;

/**
 * Validate an untrusted parsed JSON value. Version is checked first so an
 * unknown major version is reported as such rather than as a schema error.
 */
export function parseCarryPayload(value: unknown): CarryPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CarryError("PACKET_SCHEMA_INVALID");
  }
  const record = value as Record<string, unknown>;
  if (record.v !== 1) throw new CarryError("UNSUPPORTED_VERSION");

  const schema =
    record.type === "INVITE"
      ? invitePayloadSchema
      : record.type === "JOIN_REQUEST"
        ? joinRequestPayloadSchema
        : record.type === "JOIN_APPROVAL"
          ? joinApprovalPayloadSchema
          : record.type === "MESSAGE" || record.type === "ACK"
            ? packetEnvelopeSchema
            : null;
  if (!schema) throw new CarryError("PACKET_SCHEMA_INVALID");

  const result = schema.safeParse(value);
  if (!result.success) throw new CarryError("PACKET_SCHEMA_INVALID");
  return result.data;
}
