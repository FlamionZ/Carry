import { CarryError } from "../errors";
import type { PacketEnvelope, RelayEntry } from "./schemas";

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

/** The hopCount a relay would show, after the expiry and hop-limit checks (§11). */
export function nextRelayHop(env: PacketEnvelope, now: number): number {
  if (isExpired(env.expiresAt, now)) throw new CarryError("PACKET_EXPIRED");
  const nextHop = env.relay.hopCount + 1;
  if (nextHop >= env.maxHops) throw new CarryError("RELAY_LIMIT_REACHED");
  return nextHop;
}

/**
 * Returns a relay copy with hopCount incremented and, when given, the relay's
 * entry appended (§11A). Only the mutable relay section changes; header,
 * nonce, ciphertext, certificate and signature are preserved byte-for-byte in value.
 */
export function prepareRelay(env: PacketEnvelope, now: number, entry?: RelayEntry): PacketEnvelope {
  const hopCount = nextRelayHop(env, now);
  const entries = entry ? [...(env.relay.entries ?? []), entry] : env.relay.entries;
  return { ...env, relay: entries ? { hopCount, entries } : { hopCount } };
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

/** The glossary words for what this device has observed about a packet (GLOSSARY.md, "Status on a device"). */
export type StatusLabel =
  | "Created"
  | "Shown"
  | "Received"
  | "Shown for relay"
  | "Acknowledged"
  | "Expired"
  | "Rejected";

/**
 * The single mapping from stored status values to displayed words. Stored
 * values are unchanged: READY reads Created until the author first shows the
 * frames (`firstShownAt`), then Shown.
 */
export function statusLabel(
  record: { status: PacketStatus; expiresAt: number; firstShownAt?: number },
  now: number,
): StatusLabel {
  switch (effectiveStatus(record.status, record.expiresAt, now)) {
    case "READY":
      return record.firstShownAt === undefined ? "Created" : "Shown";
    case "IMPORTED":
      return "Received";
    case "RELAYED":
      return "Shown for relay";
    case "ACKNOWLEDGED":
      return "Acknowledged";
    case "EXPIRED":
      return "Expired";
    case "REJECTED":
      return "Rejected";
  }
}

/** Status shown to the user, taking local expiry into account. */
export function effectiveStatus(status: PacketStatus, expiresAt: number, now: number): PacketStatus {
  if (status === "ACKNOWLEDGED" || status === "REJECTED") return status;
  return isExpired(expiresAt, now) ? "EXPIRED" : status;
}
