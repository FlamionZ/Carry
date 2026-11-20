import { useLiveQuery } from "dexie-react-hooks";
import { CheckCheck, QrCode, Repeat, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  createAcknowledgement,
  type PacketView,
  preparePacketForQr,
  readPacket,
} from "../../application/use-cases/packets";
import { scrollBehavior } from "../../app/motion";
import { useDevice } from "../../app/providers/DeviceProvider";
import { formatRemaining, formatTime, useAction } from "../../app/useAction";
import { PageHeader } from "../../components/AppShell";
import { ErrorNotice, Notice } from "../../components/Notice";
import { MessageKindBadge } from "../../components/MessageKindBadge";
import { QrFrameDisplay } from "../../components/QrFrameDisplay";
import { StatusBadge } from "../../components/StatusBadge";
import { packetRecordId, statusLabel } from "../../domain/packet/rules";
import { useFrames } from "../packet-transfer/useFrames";
import { ackSummary } from "./PacketRow";
import { AcknowledgementJourneys, RelayJourneySection } from "./RelayJourney";

const SHARE_BLOCKED = {
  EXPIRED: "This packet has expired. Expired packets cannot be shown or relayed.",
  RELAY_LIMIT_REACHED: "This packet has reached its relay limit, so this device cannot pass it on.",
} as const;

/** Keyed by record ID so state such as a shown QR never carries over to another packet. */
export function PacketRoute() {
  const { recordId = "" } = useParams();
  return <PacketPage key={recordId} recordId={recordId} />;
}

function PacketPage({ recordId }: { recordId: string }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const device = useDevice();
  const { db } = device;

  const record = useLiveQuery(async () => (await db.packets.get(recordId)) ?? null, [recordId]);
  const identity = useLiveQuery(() => db.localIdentity.get("local"), []);
  const acks = useLiveQuery(
    async () =>
      record?.packetType === "MESSAGE"
        ? (await db.acknowledgements.where("originalPacketId").equals(record.packetId).toArray()).filter(
            (a) => a.communityId === record.communityId,
          )
        : [],
    [record?.packetId, record?.packetType, record?.communityId],
  );

  const [view, setView] = useState<PacketView | null>(null);
  const [viewError, setViewError] = useState<unknown>(null);
  const [payload, setPayload] = useState<string | null>(null);
  const { frames, error: frameError } = useFrames(payload);
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (frames) qrRef.current?.scrollIntoView({ block: "start", behavior: scrollBehavior() });
  }, [frames]);

  useEffect(() => {
    if (!record) return;
    let cancelled = false;
    readPacket(device, record.id)
      .then((v) => {
        if (cancelled) return;
        setView(v);
        setViewError(null);
      })
      .catch((e) => {
        if (!cancelled) setViewError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [device, record]);

  const show = useAction(async () => setPayload(await preparePacketForQr(device, recordId)));
  const ack = useAction(async () => {
    const ackRecord = await createAcknowledgement(device, recordId);
    navigate(`/p/${encodeURIComponent(ackRecord.id)}?show=1`);
  });

  // Freshly created packets open with their QR already shown.
  const autoShow = params.get("show") === "1";
  const loaded = !!record;
  useEffect(() => {
    if (autoShow && loaded) void show.run();
  }, [autoShow, loaded]);

  if (record === undefined) return null;
  if (record === null) {
    return <PageHeader title="Packet not found" back="/" subtitle="It is not stored on this device." />;
  }

  const back = `/c/${encodeURIComponent(record.communityId)}`;
  const isMessage = record.packetType === "MESSAGE";
  const outbound = record.direction === "OUTBOUND";
  const label = view?.statusLabel ?? statusLabel(record, device.now());
  const share = view?.share ?? "OK";
  const myId = identity?.memberId;
  const myAck = (acks ?? []).find((a) => a.acknowledgedBy === myId);
  const returnedAcks = (acks ?? []).filter((a) => a.receivedAt !== null);
  const carriedAcks = (acks ?? []).filter((a) => a.acknowledgedBy !== myId && a.receivedAt === null);
  const ackRecordId = (ackPacketId: string) => packetRecordId(record.communityId, ackPacketId);
  const ackLink = (ackPacketId: string, showQr = false) =>
    `/p/${encodeURIComponent(ackRecordId(ackPacketId))}${showQr ? "?show=1" : ""}`;
  const now = device.now();

  const qrLabel = !outbound
    ? "Relay copy: same packet, one more hop."
    : isMessage
      ? "Ready to pass this message along."
      : "Ready to carry this acknowledgement back.";

  return (
    <div className="space-y-4">
      <PageHeader title={isMessage ? "Message" : "Acknowledgement"} back={back} />

      {viewError ? (
        <ErrorNotice error={viewError} />
      ) : (
        <article className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              {outbound ? "You" : (view?.senderName ?? "…")}
              {view?.senderRole === "ADMIN" && <span className="ml-2 text-xs uppercase muted">admin</span>}
            </p>
            <StatusBadge label={label} />
          </div>
          {isMessage ? (
            <>
              {view?.messageKind && <MessageKindBadge kind={view.messageKind} />}
              {/* Rendered as text only, never as HTML. */}
              <p className="whitespace-pre-wrap break-words text-lg">{view?.text ?? "Verifying…"}</p>
            </>
          ) : (
            <div className="space-y-1">
              <p className="break-words">{view ? ackSummary(view, 140) : "Verifying…"}</p>
              {view?.original?.found && (
                <Link
                  className="text-sm font-semibold text-forest underline"
                  to={`/p/${encodeURIComponent(view.original.recordId)}`}
                >
                  Open the message
                </Link>
              )}
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="muted">Created</dt>
            <dd>{formatTime(record.createdAt)}</dd>
            <dt className="muted">Expires</dt>
            <dd>{record.expiresAt > now ? `in ${formatRemaining(record.expiresAt - now)}` : "expired"}</dd>
            <dt className="muted">Relay hops</dt>
            <dd>
              {record.hopCount} of {view?.envelope.maxHops ?? "–"}
            </dd>
            <dt className="muted">Packet ID</dt>
            <dd className="mono truncate text-xs leading-5">{record.packetId}</dd>
          </dl>
        </article>
      )}

      {!viewError && view?.journey && (
        <RelayJourneySection
          journey={view.journey}
          authorName={view.senderName}
          createdAt={record.createdAt}
          scannedAt={record.firstSeenAt}
          writtenWhat={isMessage ? "the message" : "the acknowledgement"}
        />
      )}

      {isMessage && outbound && (
        <section className="card space-y-2" aria-labelledby="acknowledgements-heading">
          <h2 id="acknowledgements-heading" className="text-base">
            Acknowledgements
          </h2>
          {returnedAcks.length === 0 ? (
            <p className="text-sm muted">
              None yet. An acknowledgement has to be carried back to this device and scanned before it appears here.
            </p>
          ) : (
            <ul className="space-y-4 text-sm">
              {returnedAcks.map((a) => (
                <li key={a.id} className="space-y-3">
                  <p className="flex flex-wrap items-center gap-x-2">
                    <CheckCheck size={16} className="text-teal-dark" aria-hidden="true" />
                    <span className="font-semibold">{a.acknowledgedByName}</span>
                    <span className="muted">· scanned {formatTime(a.receivedAt!)}</span>
                  </p>
                  {view && (
                    <AcknowledgementJourneys
                      returned={view.acknowledgements?.find((r) => r.ackRecordId === ackRecordId(a.ackPacketId))}
                      authorName={view.senderName}
                      messageCreatedAt={record.createdAt}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isMessage && !outbound && !viewError && (
        <Notice>Message received on this device. Return an acknowledgement to confirm it with the sender.</Notice>
      )}

      {isMessage && !outbound && carriedAcks.length > 0 && (
        <section className="card space-y-2">
          <h2 className="text-base">Acknowledgements to carry back</h2>
          <ul className="space-y-2 text-sm">
            {carriedAcks.map((a) => (
              <li key={a.id}>
                <Link className="font-semibold text-forest underline" to={ackLink(a.ackPacketId)}>
                  {a.acknowledgedByName} acknowledged this message
                </Link>
                <span className="muted"> · relay it toward {view?.senderName ?? "the sender"}.</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!viewError && (
        <div className="space-y-3">
          {payload && frames ? (
            <div ref={qrRef} className="scroll-mt-20 space-y-3">
              <QrFrameDisplay frames={frames} label={qrLabel} />
              <button type="button" className="btn-ghost w-full" onClick={() => setPayload(null)}>
                <X size={18} aria-hidden="true" /> Hide QR
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => void show.run()}
              disabled={share !== "OK" || show.pending || !view}
            >
              {outbound ? <QrCode size={20} aria-hidden="true" /> : <Repeat size={20} aria-hidden="true" />}
              {outbound ? "Show QR to pass along" : "Relay this packet"}
            </button>
          )}
          {share !== "OK" && <p className="text-center text-sm muted">{SHARE_BLOCKED[share]}</p>}
          <ErrorNotice error={show.error ?? frameError} />

          {isMessage && !outbound && (
            <>
              <p className="text-sm muted">
                An acknowledgement must be carried back to the sender before they can see it.
              </p>
              {myAck ? (
                <Link className="btn-attention w-full" to={ackLink(myAck.ackPacketId, true)}>
                  <CheckCheck size={20} aria-hidden="true" /> Show my acknowledgement
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn-attention w-full"
                  onClick={() => void ack.run()}
                  disabled={ack.pending}
                >
                  <CheckCheck size={20} aria-hidden="true" /> Acknowledge
                </button>
              )}
              <ErrorNotice error={ack.error} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
