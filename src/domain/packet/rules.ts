import { CarryError } from "../errors";
import type { PacketEnvelope } from "./schemas";

export type PacketStatus = "READY" | "IMPORTED" | "RELAYED" | "ACKNOWLEDGED" | "EXPIRED" | "REJECTED";
export type PacketDirection = "OUTBOUND" | "INBOUND";

export function packetRecordId(communityId: string, packetId: string): string {
  return `${communityId}:${packetId}`;
}

export function isExpired(expiresAt: number, now: number): boolean {
  return now >= expiresAt;
}

/** Checks applied before a received packet is accepted (PACKET_PROTOCOL.md §11–12). */
export function assertImportable(env: PacketEnvelope, now: number): void {
  if (env.expiresAt <= env.createdAt) throw new CarryError("PACKET_SCHEMA_INVALID");
  if (isExpired(env.expiresAt, now)) throw new CarryError("PACKET_EXPIRED");
  if (env.relay.hopCount >= env.maxHops) throw new CarryError("RELAY_LIMIT_REACHED");
}

/**
 * Returns a relay copy with hopCount incremented. Only the mutable relay
 * metadata changes; header, nonce, ciphertext, certificate and signature are
 * preserved byte-for-byte in value.
 */
export function prepareRelay(env: PacketEnvelope, now: number): PacketEnvelope {
  if (isExpired(env.expiresAt, now)) throw new CarryError("PACKET_EXPIRED");
  const nextHop = env.relay.hopCount + 1;
  if (nextHop >= env.maxHops) throw new CarryError("RELAY_LIMIT_REACHED");
  return { ...env, relay: { hopCount: nextHop } };
}

export type ShareState = "OK" | "EXPIRED" | "RELAY_LIMIT_REACHED";

/**
 * Whether this device may display a stored packet as QR: senders show their
 * own packet at hop 0; relays show it at hopCount + 1, which must stay below maxHops.
 */
export function shareState(
  direction: PacketDirection,
  env: Pick<PacketEnvelope, "expiresAt" | "maxHops" | "relay">,
  now: number,
): ShareState {
  if (isExpired(env.expiresAt, now)) return "EXPIRED";
  if (direction === "INBOUND" && env.relay.hopCount + 1 >= env.maxHops) return "RELAY_LIMIT_REACHED";
  return "OK";
}

/** Status shown to the user, taking local expiry into account. */
export function effectiveStatus(status: PacketStatus, expiresAt: number, now: number): PacketStatus {
  if (status === "ACKNOWLEDGED" || status === "REJECTED") return status;
  return isExpired(expiresAt, now) ? "EXPIRED" : status;
}
