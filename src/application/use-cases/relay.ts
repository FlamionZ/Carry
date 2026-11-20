/**
 * Relay entries and the relay journey (PACKET_PROTOCOL.md §11A).
 *
 * A relay signs one entry into the packet's mutable relay section each time it
 * shows a received packet. A receiving device checks the entries after the
 * sender signature and before decryption, and builds the journey it shows.
 *
 * The checks take the packet they belong to and the relay section separately,
 * so an acknowledgement's copied `messageRelay` (§10) can be checked against
 * the original message with the same code.
 */
import { relayEntryChainText, relayEntrySigningString } from "../../domain/canonical";
import { utf8Encode } from "../../domain/encoding";
import { CarryError } from "../../domain/errors";
import {
  assertRelayEntryOrder,
  isJourneyRecorded,
  type RelayClockFlag,
  relayClockFlags,
  relayEntries,
} from "../../domain/packet/relay";
import type { PacketEnvelope, PublicJwk, RelayEntry, RelaySection } from "../../domain/packet/schemas";
import { sha256B64u, sign, verify } from "../../infrastructure/crypto/webcrypto";
import type { Device } from "../device";
import { requireIdentity } from "./identity";

/** The immutable packet fields relay entries bind to. */
export type RelaySubject = Pick<
  PacketEnvelope,
  "communityId" | "packetId" | "senderId" | "senderSignature" | "createdAt" | "memberCertificate"
>;

/**
 * VERIFIED: a known member's signature checked out.
 * UNKNOWN_MEMBER: this device has no certificate for the member; never shown as verified.
 * SIGNATURE_FAILED: a known member's signature did not verify. Import rejects
 * such packets; it can appear only when reading a stored packet after this
 * device later learned that member's certificate.
 */
export type RelayHopStatus = "VERIFIED" | "UNKNOWN_MEMBER" | "SIGNATURE_FAILED";

export interface RelayJourneyHop {
  hop: number;
  memberId: string;
  /** The relay's own clock when it showed the packet. Reported, not trusted. */
  at: number;
  status: RelayHopStatus;
  /** From a membership certificate this device holds; absent for unknown members. */
  displayName?: string;
  flags: RelayClockFlag[];
}

export interface RelayJourney {
  hopCount: number;
  /** False for an unrecorded journey: hops were made but no entries were carried. */
  recorded: boolean;
  /** In hop order. Empty when the journey is unrecorded or the packet came straight from the author. */
  hops: RelayJourneyHop[];
}

function signingStringOf(subject: RelaySubject, entry: Omit<RelayEntry, "sig">, prevHash: string): string {
  return relayEntrySigningString({
    packetId: subject.packetId,
    hop: entry.hop,
    memberId: entry.memberId,
    at: entry.at,
    prevHash,
  });
}

/**
 * Recomputes the hash chain (rule 3): `prevHashes[i]` is the value entry i
 * signs over; `next` is what a new entry appended after them signs over.
 */
async function relayChain(
  subject: RelaySubject,
  entries: readonly RelayEntry[],
): Promise<{ prevHashes: string[]; next: string }> {
  const prevHashes: string[] = [];
  let prevHash = await sha256B64u(subject.senderSignature);
  for (const entry of entries) {
    prevHashes.push(prevHash);
    prevHash = await sha256B64u(relayEntryChainText(signingStringOf(subject, entry, prevHash), entry.sig));
  }
  return { prevHashes, next: prevHash };
}

/** Signs this device's entry for `hop`, chained from the entries already on the packet. */
export async function signRelayEntry(device: Device, subject: RelaySubject, relay: RelaySection, hop: number) {
  const identity = await requireIdentity(device);
  const { next } = await relayChain(subject, relayEntries(relay));
  const unsigned = { memberId: identity.memberId, hop, at: device.now() };
  const sig = await sign(identity.signingPrivateKey, utf8Encode(signingStringOf(subject, unsigned, next)));
  return { ...unsigned, sig } satisfies RelayEntry;
}

interface KnownMember {
  displayName: string;
  signingPublicJwk: PublicJwk;
}

/** Rule 4: known = a membership record with a signing key here, or the packet's verified sender. */
async function knownMembers(device: Device, subject: RelaySubject, entries: readonly RelayEntry[]) {
  const ids = [...new Set(entries.map((e) => e.memberId))];
  const records = await device.db.memberships.bulkGet(ids.map((id) => `${subject.communityId}:${id}`));
  const known = new Map<string, KnownMember>();
  records.forEach((r, i) => {
    if (r?.signingPublicJwk) known.set(ids[i]!, { displayName: r.displayName, signingPublicJwk: r.signingPublicJwk });
  });
  const cert = subject.memberCertificate.body;
  known.set(subject.senderId, { displayName: cert.displayName, signingPublicJwk: cert.signingPublicJwk });
  return known;
}

/**
 * Builds the relay journey without rejecting on signatures (rules 2–6).
 * Rule 1 and 2 violations still throw RELAY_ENTRY_INVALID: such a list has no
 * journey to show. `scannedAt` is when this device scanned the packet.
 */
export async function describeRelayJourney(
  device: Device,
  subject: RelaySubject,
  relay: RelaySection,
  scannedAt: number,
): Promise<RelayJourney> {
  assertRelayEntryOrder(relay);
  const entries = relayEntries(relay);
  const recorded = isJourneyRecorded(relay);
  if (entries.length === 0) return { hopCount: relay.hopCount, recorded, hops: [] };

  const { prevHashes } = await relayChain(subject, entries);
  const known = await knownMembers(device, subject, entries);
  const hops = await Promise.all(
    entries.map(async (entry, i): Promise<RelayJourneyHop> => {
      const member = known.get(entry.memberId);
      const flags = relayClockFlags(entry.at, subject.createdAt, scannedAt);
      const base = { hop: entry.hop, memberId: entry.memberId, at: entry.at, flags };
      if (!member) return { ...base, status: "UNKNOWN_MEMBER" };
      const ok = await verify(
        member.signingPublicJwk,
        entry.sig,
        utf8Encode(signingStringOf(subject, entry, prevHashes[i]!)),
      );
      return { ...base, status: ok ? "VERIFIED" : "SIGNATURE_FAILED", displayName: member.displayName };
    }),
  );
  return { hopCount: relay.hopCount, recorded, hops };
}

/** Import-time check (rules 1–4): throws RELAY_ENTRY_INVALID, otherwise returns the journey. */
export async function verifyRelayEntries(
  device: Device,
  subject: RelaySubject,
  relay: RelaySection,
  scannedAt: number,
): Promise<RelayJourney> {
  const journey = await describeRelayJourney(device, subject, relay, scannedAt);
  if (journey.hops.some((h) => h.status === "SIGNATURE_FAILED")) throw new CarryError("RELAY_ENTRY_INVALID");
  return journey;
}
