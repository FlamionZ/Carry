import { CheckCheck, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { type PacketView, readPacket } from "../../application/use-cases/packets";
import { useDevice } from "../../app/providers/DeviceProvider";
import { formatTime } from "../../app/useAction";
import { StatusBadge } from "../../components/StatusBadge";
import { describeError } from "../../domain/errors";
import { statusLabel } from "../../domain/packet/rules";
import type { PacketRecord } from "../../infrastructure/db/db";

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** One-line description of an ACK, e.g. "Chris acknowledged Alex's message: “Meet at…”". */
export function ackSummary(view: PacketView, quoteLength = 60): string {
  const by = view.record.direction === "OUTBOUND" ? "You" : view.senderName;
  const o = view.original;
  const whose = !o?.found ? "a message" : o.outbound ? "your message" : `${o.senderName ?? "a member"}'s message`;
  const quote = o?.text ? `: “${truncate(o.text, quoteLength)}”` : "";
  return `${by} acknowledged ${whose}${quote}`;
}

export function PacketRow({ record }: { record: PacketRecord }) {
  const device = useDevice();
  const [view, setView] = useState<PacketView | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    readPacket(device, record.id)
      .then((v) => {
        if (!cancelled) setView(v);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [device, record.id, record.status, record.lastActionAt, record.firstShownAt]);

  const isAck = record.packetType === "ACK";
  const Icon = isAck ? CheckCheck : MessageSquare;
  const title = isAck ? "Acknowledgement" : record.direction === "OUTBOUND" ? "You" : (view?.senderName ?? "…");
  const summary = view ? (isAck ? ackSummary(view) : (view.text ?? "")) : "Verifying…";

  return (
    <Link to={`/p/${encodeURIComponent(record.id)}`} className="card block space-y-2 hover:border-teal">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          <Icon size={16} aria-hidden="true" />
          {title}
        </span>
        <span className="muted">{formatTime(record.createdAt)}</span>
      </div>
      {/* Rendered as text only, never as HTML. */}
      <p className="line-clamp-2 whitespace-pre-wrap break-words">
        {error ? <span className="text-alert-dark">{describeError(error).message}</span> : summary}
      </p>
      <StatusBadge label={view?.statusLabel ?? statusLabel(record, device.now())} />
    </Link>
  );
}
