import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { handleScannedText, type ScanOutcome } from "../../application/use-cases/scan";
import { discardTransfer } from "../../application/use-cases/transfer";
import { useDevice } from "../../app/providers/DeviceProvider";
import { formatTime } from "../../app/useAction";
import { PageHeader } from "../../components/AppShell";
import { ErrorNotice, Notice } from "../../components/Notice";
import { QrScanner } from "../../components/QrScanner";
import { isCarryError } from "../../domain/errors";
import { JoinFromInvite } from "../membership/JoinFromInvite";

type InviteOutcome = Extract<ScanOutcome, { kind: "INVITE" }>;

const RESCAN_WINDOW_MS = 2500;

export function ScanPage() {
  const device = useDevice();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<{ transferId: string; received: number[]; total: number } | null>(null);
  const partials = useLiveQuery(
    async () => (await device.db.transfers.where("status").equals("PARTIAL").toArray()).sort((a, b) => b.updatedAt - a.updatedAt),
    [],
  );
  const unfinished = (partials ?? []).filter((t) => t.id !== progress?.transferId);
  const [invite, setInvite] = useState<InviteOutcome | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const [done, setDoneState] = useState(false);
  const doneRef = useRef(false);
  const setDone = (value: boolean) => {
    doneRef.current = value;
    setDoneState(value);
  };

  // Serialize scans; the camera reports the same frame many times per second.
  const queue = useRef(Promise.resolve());
  const seen = useRef(new Map<string, number>());

  const route = (outcome: ScanOutcome) => {
    switch (outcome.kind) {
      case "PARTIAL":
        setProgress({ transferId: outcome.transferId, received: outcome.received, total: outcome.total });
        return;
      case "INVITE":
        setDone(true);
        setInvite(outcome);
        return;
      case "JOIN_REQUEST":
        setDone(true);
        navigate(`/requests/${encodeURIComponent(outcome.requestId)}`);
        return;
      case "JOIN_APPROVAL":
        setDone(true);
        navigate(`/c/${encodeURIComponent(outcome.communityId)}`);
        return;
      case "MESSAGE":
        setDone(true);
        navigate(`/p/${encodeURIComponent(outcome.recordId)}`);
        return;
      case "ACK":
        setDone(true);
        navigate(
          `/p/${encodeURIComponent(outcome.acknowledgedOwn && outcome.originalRecordId ? outcome.originalRecordId : outcome.recordId)}`,
        );
        return;
    }
  };

  const onText = (text: string) => {
    const now = Date.now();
    const last = seen.current.get(text);
    if (last !== undefined && now - last < RESCAN_WINDOW_MS) return;
    seen.current.set(text, now);

    queue.current = queue.current.then(async () => {
      if (doneRef.current) return;
      try {
        const outcome = await handleScannedText(device, text);
        setError(null);
        setDuplicateOf(null);
        route(outcome);
      } catch (err) {
        setProgress(null);
        if (isCarryError(err, "PACKET_DUPLICATE")) {
          setDuplicateOf((err.details?.recordId as string | undefined) ?? null);
          setError(null);
        } else {
          setError(err);
        }
      }
    });
  };

  const reset = () => {
    setProgress(null);
    setInvite(null);
    setError(null);
    setDuplicateOf(null);
    setDone(false);
    seen.current.clear();
  };

  if (invite) {
    return (
      <div className="space-y-4">
        <PageHeader title="Invitation scanned" subtitle="Step 1 of 3: confirm before requesting to join." />
        <JoinFromInvite invite={invite.invite} fingerprint={invite.fingerprint} onCancel={reset} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Scan a QR"
        subtitle="Invitations, join requests, approvals, messages and acknowledgements all start here."
      />

      {progress && (
        <div className="card space-y-2" aria-live="polite">
          <p className="font-display text-lg font-bold">
            {progress.received.length} of {progress.total} QR frames scanned.
          </p>
          <div className="flex gap-1">
            {Array.from({ length: progress.total }, (_, i) => (
              <span
                key={i}
                className={`flex h-8 flex-1 items-center justify-center rounded-control text-xs font-semibold ${
                  progress.received.includes(i) ? "bg-teal text-ink" : "bg-sage/20 text-sage-dark"
                }`}
              >
                {i + 1}
              </span>
            ))}
          </div>
          <p className="text-sm muted">Keep scanning. Nothing is shown until every frame is verified.</p>
        </div>
      )}

      {duplicateOf !== null && (
        <Notice tone="attention" title="Already on this device">
          This packet was imported before, so no new entry was created.{" "}
          {duplicateOf && (
            <Link className="font-semibold underline" to={`/p/${encodeURIComponent(duplicateOf)}`}>
              Open it
            </Link>
          )}
        </Notice>
      )}
      <ErrorNotice error={error} />
      {(error || duplicateOf !== null) && (
        <button type="button" className="btn-ghost w-full" onClick={reset}>
          Start a new scan
        </button>
      )}

      <QrScanner onText={onText} disabled={done} />

      {unfinished.length > 0 && (
        <section className="card space-y-3" aria-label="Unfinished transfers">
          <div>
            <h2 className="text-base">Unfinished transfers</h2>
            <p className="text-sm muted">
              Scan the remaining frames from the same QR display to finish. If that display was closed, ask for the
              QR again; a new display starts a new transfer. Unfinished transfers are removed after 24 hours.
            </p>
          </div>
          <ul className="space-y-2">
            {unfinished.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-control bg-paper p-3 text-sm">
                <span>
                  <span className="font-semibold">
                    {t.receivedCount} of {t.frameCount} frames
                  </span>
                  <span className="muted"> · last frame {formatTime(t.updatedAt)}</span>
                </span>
                <button type="button" className="btn-ghost min-h-10 px-3" onClick={() => void discardTransfer(device, t.id)}>
                  Discard
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
