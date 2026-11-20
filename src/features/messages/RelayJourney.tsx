import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { RelayHopStatus, RelayJourney, RelayJourneyHop } from "../../application/use-cases/relay";
import { formatTime } from "../../app/useAction";
import type { RelayClockFlag } from "../../domain/packet/relay";

// Teal is reserved for Acknowledged, so verified relays use forest.
const MARKERS: Record<RelayHopStatus, { text: string; className: string; Icon: typeof ShieldCheck }> = {
  VERIFIED: { text: "Verified", className: "bg-forest/10 text-forest", Icon: ShieldCheck },
  UNKNOWN_MEMBER: { text: "Unknown member on this device", className: "bg-sage/20 text-sage-dark", Icon: ShieldQuestion },
  SIGNATURE_FAILED: { text: "Signature does not verify", className: "bg-alert/15 text-alert-dark", Icon: ShieldAlert },
};

const FLAGS: Record<RelayClockFlag, string> = {
  BEFORE_CREATION: "This time is more than 5 minutes before the message was written. That phone's clock may be wrong.",
  IN_FUTURE: "This time is more than 5 minutes after this device scanned the packet. That phone's clock may be wrong.",
};

function hopName(hop: RelayJourneyHop): string | undefined {
  return hop.status === "UNKNOWN_MEMBER" ? undefined : hop.displayName;
}

/** One line of plain text, e.g. "Alex → unknown member → you". */
export function journeySummary(journey: RelayJourney, authorName: string): string {
  const middle = journey.recorded
    ? journey.hops.map((h) => hopName(h) ?? "unknown member")
    : [`${journey.hopCount} unrecorded ${journey.hopCount === 1 ? "hop" : "hops"}`];
  return [authorName, ...middle, "you"].join(" → ");
}

function Marker({ status }: { status: RelayHopStatus }) {
  const { text, className, Icon } = MARKERS[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      <Icon size={14} aria-hidden="true" />
      {text}
    </span>
  );
}

/**
 * How a received packet reached this device: the author, each recorded relay
 * in hop order, then this device. Static text only; nothing animates.
 */
export function RelayJourneySection({
  journey,
  authorName,
  createdAt,
  scannedAt,
}: {
  journey: RelayJourney;
  authorName: string;
  createdAt: number;
  scannedAt: number;
}) {
  return (
    <section className="card space-y-3" aria-labelledby="relay-journey-heading">
      <h2 id="relay-journey-heading" className="text-base">
        Relay journey
      </h2>
      <p className="font-semibold">{journeySummary(journey, authorName)}</p>
      {!journey.recorded && (
        <p className="text-sm muted">
          Unrecorded journey. The packet reports {journey.hopCount} relay {journey.hopCount === 1 ? "hop" : "hops"} but
          carries no relay entries, so this device cannot say who carried it. Relays running an older version of CARRY
          do not record entries.
        </p>
      )}
      <ol className="space-y-3 border-l-2 border-forest/20 pl-4 text-sm" aria-label="Relay journey, in hop order">
        <li>
          <p className="font-semibold">{authorName}</p>
          <p className="muted">
            Author · wrote it {formatTime(createdAt)}, according to {authorName}'s phone
          </p>
        </li>
        {journey.hops.map((hop) => {
          const name = hopName(hop);
          return (
            <li key={hop.hop} className="space-y-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{name ?? "Unknown member"}</span>
                <Marker status={hop.status} />
              </p>
              <p className="muted">
                Hop {hop.hop} · shown {formatTime(hop.at)}, according to{" "}
                {name ? `${name}'s phone` : "this relay's phone"}
              </p>
              {hop.flags.map((flag) => (
                <p key={flag} className="text-amber-dark">
                  Time flagged: {FLAGS[flag]}
                </p>
              ))}
              <p className="mono break-all text-xs muted">Member ID {hop.memberId}</p>
            </li>
          );
        })}
        <li>
          <p className="font-semibold">You</p>
          <p className="muted">Scanned on this device {formatTime(scannedAt)}</p>
        </li>
      </ol>
    </section>
  );
}
