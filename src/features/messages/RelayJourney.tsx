import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { useId } from "react";
import type { ReturnedAcknowledgement } from "../../application/use-cases/packets";
import type { RelayHopStatus, RelayJourney, RelayJourneyHop } from "../../application/use-cases/relay";
import { formatTime } from "../../app/useAction";
import type { RelayClockFlag } from "../../domain/packet/relay";

// Teal is reserved for Acknowledged, so verified relays use forest.
const MARKERS: Record<RelayHopStatus, { text: string; className: string; Icon: typeof ShieldCheck }> = {
  VERIFIED: { text: "Verified", className: "bg-forest/10 text-forest", Icon: ShieldCheck },
  UNKNOWN_MEMBER: { text: "Unknown member on this device", className: "bg-sage/20 text-sage-dark", Icon: ShieldQuestion },
  SIGNATURE_FAILED: { text: "Signature does not verify", className: "bg-alert/15 text-alert-dark", Icon: ShieldAlert },
};

function flagText(flag: RelayClockFlag, writtenWhat: string, scannedWhat: string): string {
  return flag === "BEFORE_CREATION"
    ? `This time is more than 5 minutes before ${writtenWhat} was written. That phone's clock may be wrong.`
    : `This time is more than 5 minutes after this device scanned ${scannedWhat}. That phone's clock may be wrong.`;
}

function hopName(hop: RelayJourneyHop): string | undefined {
  return hop.status === "UNKNOWN_MEMBER" ? undefined : hop.displayName;
}

/** One line of plain text, e.g. "Alex → unknown member → you". */
export function journeySummary(journey: RelayJourney, fromName: string, toName = "you"): string {
  const middle = journey.recorded
    ? journey.hops.map((h) => hopName(h) ?? "unknown member")
    : [`${journey.hopCount} unrecorded ${journey.hopCount === 1 ? "hop" : "hops"}`];
  return [fromName, ...middle, toName].join(" → ");
}

/** The first or last stop of a journey: who, and one line of what happened there. */
export interface JourneyEnd {
  name: string;
  detail: string;
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
  writtenWhat,
}: {
  journey: RelayJourney;
  authorName: string;
  createdAt: number;
  scannedAt: number;
  writtenWhat?: string;
}) {
  return (
    <JourneySection
      title="Relay journey"
      journey={journey}
      writtenWhat={writtenWhat}
      from={{
        name: authorName,
        detail: `Author · wrote it ${formatTime(createdAt)}, according to ${authorName}'s phone`,
      }}
      to={{ name: "You", detail: `Scanned on this device ${formatTime(scannedAt)}` }}
      toSummaryName="you"
    />
  );
}

/**
 * Any recorded journey between two named stops, e.g. a message's way out to
 * an acknowledging member or an acknowledgement's way back (PACKET_PROTOCOL.md §10).
 */
export function JourneySection({
  title,
  journey,
  from,
  to,
  toSummaryName = to.name,
  className = "card space-y-3",
  headingLevel = 2,
  writtenWhat = "the message",
  scannedWhat = "the packet",
}: {
  title: string;
  journey: RelayJourney;
  from: JourneyEnd;
  to: JourneyEnd;
  toSummaryName?: string;
  className?: string;
  headingLevel?: 2 | 3;
  /** For the clock-flag text: the packet whose creation time the hops are compared with. */
  writtenWhat?: string;
  /** For the clock-flag text: what this device scanned (the packet, or the ACK carrying a copied journey). */
  scannedWhat?: string;
}) {
  const headingId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className={className} aria-labelledby={headingId}>
      <Heading id={headingId} className="text-base">
        {title}
      </Heading>
      <p className="font-semibold">{journeySummary(journey, from.name, toSummaryName)}</p>
      {!journey.recorded && (
        <p className="text-sm muted">
          Unrecorded journey. The packet reports {journey.hopCount} relay {journey.hopCount === 1 ? "hop" : "hops"} but
          carries no relay entries, so this device cannot say who carried it. Relays running an older version of CARRY
          do not record entries.
        </p>
      )}
      <ol className="space-y-3 border-l-2 border-forest/20 pl-4 text-sm" aria-label={`${title}, in hop order`}>
        <li>
          <p className="font-semibold">{from.name}</p>
          <p className="muted">{from.detail}</p>
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
                  Time flagged: {flagText(flag, writtenWhat, scannedWhat)}
                </p>
              ))}
              <p className="mono break-all text-xs muted">Member ID {hop.memberId}</p>
            </li>
          );
        })}
        <li>
          <p className="font-semibold">{to.name}</p>
          <p className="muted">{to.detail}</p>
        </li>
      </ol>
    </section>
  );
}

/**
 * On the author's message page: how the message reached the acknowledging
 * member (the copy carried in the ACK, re-verified here) and how the ACK came
 * back to this device (PACKET_PROTOCOL.md §10).
 */
export function AcknowledgementJourneys({
  returned,
  authorName,
  messageCreatedAt,
}: {
  returned: ReturnedAcknowledgement | undefined;
  authorName: string;
  messageCreatedAt: number;
}) {
  if (!returned) {
    return <p className="muted">This device cannot verify this acknowledgement any more, so its journeys are not shown.</p>;
  }
  const member = returned.acknowledgedByName;
  const nested = "space-y-3 rounded-lg border border-forest/15 p-3";
  const acknowledged = `Acknowledged it ${formatTime(returned.ackCreatedAt)}, according to ${member}'s phone`;
  return (
    <div className="space-y-3">
      {returned.outbound ? (
        <JourneySection
          title={`Message journey to ${member}`}
          headingLevel={3}
          className={nested}
          journey={returned.outbound}
          from={{ name: authorName, detail: `Author (you) · wrote it ${formatTime(messageCreatedAt)}` }}
          to={{ name: member, detail: acknowledged }}
          scannedWhat="the acknowledgement"
        />
      ) : (
        <section className={nested} aria-label={`Message journey to ${member}`}>
          <h3 className="text-base">Message journey to {member}</h3>
          <p className="muted">
            Not reported. This acknowledgement does not say how the message reached {member}: it came from an older
            version of CARRY, or there was no room for the journey in its QR frames.
          </p>
        </section>
      )}
      <JourneySection
        title={`Acknowledgement journey back from ${member}`}
        headingLevel={3}
        className={nested}
        journey={returned.back}
        from={{ name: member, detail: acknowledged }}
        to={{ name: authorName, detail: `You · scanned it on this device ${formatTime(returned.receivedAt)}` }}
        writtenWhat="the acknowledgement"
        scannedWhat="the acknowledgement"
      />
    </div>
  );
}
