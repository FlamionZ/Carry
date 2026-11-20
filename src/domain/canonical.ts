/**
 * Canonical serialization. Every signed or authenticated byte string is
 * produced here so sender and receiver never depend on object key order.
 */

export const PROTOCOL_LABEL = "CARRY";
export const PROTOCOL_VERSION = 1;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Deterministic JSON: object keys sorted by code unit, no whitespace,
 * `undefined` properties omitted. Rejects non-finite numbers.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): Json {
  if (value === null) return null;
  switch (typeof value) {
    case "boolean":
    case "string":
      return value;
    case "number":
      if (!Number.isFinite(value)) throw new Error("Non-finite number in canonical JSON");
      return value;
    case "object": {
      if (Array.isArray(value)) return value.map((v) => normalize(v));
      const out: { [key: string]: Json } = {};
      for (const key of Object.keys(value as object).sort()) {
        const v = (value as Record<string, unknown>)[key];
        if (v !== undefined) out[key] = normalize(v);
      }
      return out;
    }
    default:
      throw new Error(`Unsupported value in canonical JSON: ${typeof value}`);
  }
}

export interface PacketHeader {
  type: "MESSAGE" | "ACK";
  communityId: string;
  packetId: string;
  keyEpoch: number;
  senderId: string;
  createdAt: number;
  expiresAt: number;
  maxHops: number;
}

/** AES-GCM AAD string (PACKET_PROTOCOL.md §6). */
export function packetAad(h: PacketHeader): string {
  return [
    PROTOCOL_LABEL,
    PROTOCOL_VERSION,
    h.type,
    h.communityId,
    h.packetId,
    h.keyEpoch,
    h.senderId,
    h.createdAt,
    h.expiresAt,
    h.maxHops,
  ].join("|");
}

/** HKDF info and wrapping AAD for JOIN_APPROVAL (PACKET_PROTOCOL.md §9). */
export function joinWrapContext(p: {
  communityId: string;
  inviteId: string;
  memberId: string;
  keyEpoch: number;
}): string {
  return [PROTOCOL_LABEL, PROTOCOL_VERSION, "JOIN_APPROVAL", p.communityId, p.inviteId, p.memberId, p.keyEpoch].join(
    "|",
  );
}

/** Canonical approval metadata covered by the admin approval signature. */
export function approvalSigningString(p: {
  communityId: string;
  inviteId: string;
  memberId: string;
  keyEpoch: number;
  certificateHash: string;
  hkdfSalt: string;
  wrapNonce: string;
  wrappedGroupKey: string;
}): string {
  return [
    PROTOCOL_LABEL,
    PROTOCOL_VERSION,
    "JOIN_APPROVAL",
    p.communityId,
    p.inviteId,
    p.memberId,
    p.keyEpoch,
    p.certificateHash,
    p.hkdfSalt,
    p.wrapNonce,
    p.wrappedGroupKey,
  ].join("|");
}

/** Relay entry signing string (PACKET_PROTOCOL.md §11A). */
export function relayEntrySigningString(p: {
  packetId: string;
  hop: number;
  memberId: string;
  at: number;
  prevHash: string;
}): string {
  return [PROTOCOL_LABEL, PROTOCOL_VERSION, "RELAY", p.packetId, p.hop, p.memberId, p.at, p.prevHash].join("|");
}

/** The text hashed into the next entry's `prevHash`: an entry's signing string and its signature. */
export function relayEntryChainText(signingString: string, sig: string): string {
  return `${signingString}|${sig}`;
}

/** Vault-wrap AAD so a wrapped group key cannot be swapped between records. */
export function vaultWrapContext(communityId: string, keyEpoch: number): string {
  return [PROTOCOL_LABEL, PROTOCOL_VERSION, "VAULT", communityId, keyEpoch].join("|");
}
