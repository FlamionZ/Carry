/**
 * Pure relay entry rules (PACKET_PROTOCOL.md §11A). Hashing and signatures
 * live in the application layer; this module holds what needs no crypto.
 */
import { CarryError } from "../errors";
import { DURATIONS } from "../limits";
import type { RelayEntry, RelaySection } from "./schemas";

export function relayEntries(relay: RelaySection): readonly RelayEntry[] {
  return relay.entries ?? [];
}

/**
 * Recorded: the entries account for every hop (none yet at hop 0, or present).
 * Unrecorded: hops were made but no entries were carried, e.g. by an older build.
 */
export function isJourneyRecorded(relay: RelaySection): boolean {
  return relay.hopCount === 0 || relayEntries(relay).length > 0;
}

/** Rules 1 (count) and 2 (order). Throws RELAY_ENTRY_INVALID. */
export function assertRelayEntryOrder(relay: RelaySection): void {
  const entries = relayEntries(relay);
  if (entries.length === 0) return;
  if (entries.length !== relay.hopCount) throw new CarryError("RELAY_ENTRY_INVALID");
  entries.forEach((entry, i) => {
    if (entry.hop !== i + 1) throw new CarryError("RELAY_ENTRY_INVALID");
  });
}

export type RelayClockFlag = "BEFORE_CREATION" | "IN_FUTURE";

/** Rule 6: reported times outside the tolerance are flagged, never rejected. */
export function relayClockFlags(at: number, createdAt: number, scannedAt: number): RelayClockFlag[] {
  const flags: RelayClockFlag[] = [];
  if (at < createdAt - DURATIONS.relayClockTolerance) flags.push("BEFORE_CREATION");
  if (at > scannedAt + DURATIONS.relayClockTolerance) flags.push("IN_FUTURE");
  return flags;
}
