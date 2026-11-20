import { useLiveQuery } from "dexie-react-hooks";
import { BookOpen, CheckCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { type LedgerItem, readLedger } from "../../application/use-cases/ledger";
import { useDevice } from "../../app/providers/DeviceProvider";
import { formatTime } from "../../app/useAction";
import { MessageKindBadge } from "../../components/MessageKindBadge";
import { ErrorNotice } from "../../components/Notice";
import { StatusBadge } from "../../components/StatusBadge";
import { acknowledgementCountText } from "../messages/acknowledgementCount";
import { journeySummary } from "../messages/RelayJourney";

function LedgerRow({ item }: { item: LedgerItem }) {
  const expiredUnanswered = item.statusLabel === "Expired" && item.acknowledgementCount === 0;
  return (
    <li>
      <Link
        to={`/p/${encodeURIComponent(item.recordId)}`}
        className="card block min-h-11 space-y-2 hover:border-teal"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <MessageKindBadge kind={item.messageKind} />
          <span className="text-sm muted">{formatTime(item.createdAt)}</span>
        </div>
        {/* Rendered as text only, never as HTML. */}
        <p className="line-clamp-2 whitespace-pre-wrap break-words">{item.text}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge label={item.statusLabel} />
          <span className="font-semibold">{acknowledgementCountText(item.messageKind, item.acknowledgementCount)}</span>
        </div>
        {expiredUnanswered && (
          <p className="text-sm">
            Expired with no acknowledgements. It can no longer be shown or relayed; write a new message if it still
            matters.
          </p>
        )}
        {item.acknowledgements.length > 0 && (
          <ul className="space-y-1 text-sm">
            {item.acknowledgements.map((a) => (
              <li key={a.ackRecordId} className="space-y-0.5">
                <p className="flex items-center gap-1.5 font-semibold">
                  <CheckCheck size={16} className="text-teal-dark" aria-hidden="true" />
                  {a.acknowledgedByName}
                  <span className="font-normal muted">· scanned {formatTime(a.receivedAt)}</span>
                </p>
                <p>
                  <span className="muted">Out: </span>
                  <span>{a.outbound ? journeySummary(a.outbound, "You", a.acknowledgedByName) : "not reported"}</span>
                </p>
                <p>
                  <span className="muted">Back: </span>
                  <span>{journeySummary(a.back, a.acknowledgedByName, "you")}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Link>
    </li>
  );
}

/** This device's own messages in one community, re-read whenever their stored data changes. */
export function LedgerTab({ communityId }: { communityId: string }) {
  const device = useDevice();
  const { db } = device;
  const [items, setItems] = useState<LedgerItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  // Everything the Ledger is built from. The live query holds only Dexie
  // reads: Dexie does not allow Web Crypto awaits inside it, so verifying and
  // decrypting (readLedger) runs once per change, below.
  const stored = useLiveQuery(
    () =>
      Promise.all([
        db.packets.where("communityId").equals(communityId).toArray(),
        db.acknowledgements.where("communityId").equals(communityId).toArray(),
        db.memberships.where("communityId").equals(communityId).toArray(),
      ]),
    [communityId],
  );

  useEffect(() => {
    if (!stored) return;
    let cancelled = false;
    readLedger(device, communityId)
      .then((v) => {
        if (cancelled) return;
        setItems(v);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [device, communityId, stored]);

  return (
    <section className="space-y-3" role="tabpanel" id="panel-ledger" aria-labelledby="tab-ledger">
      <p className="text-sm muted">
        Your own messages, newest first. Statuses, acknowledgements and journeys come only from what this device has
        scanned.
      </p>
      <ErrorNotice error={error} />
      {items?.length === 0 && (
        <div className="card text-center">
          <BookOpen className="mx-auto text-sage" size={32} aria-hidden="true" />
          <p className="mt-2 font-semibold">No messages of yours yet</p>
          <p className="text-sm muted">Messages you write in this community are listed here.</p>
        </div>
      )}
      {items && items.length > 0 && (
        <ul className="space-y-3" aria-label="Your messages">
          {items.map((item) => (
            <LedgerRow key={item.recordId} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
