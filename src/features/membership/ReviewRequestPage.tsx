import { useLiveQuery } from "dexie-react-hooks";
import { Link, useParams } from "react-router";
import { approveJoinRequest, rejectJoinRequest } from "../../application/use-cases/membership";
import { useDevice } from "../../app/providers/DeviceProvider";
import { formatTime, useAction } from "../../app/useAction";
import { useFingerprint } from "../../app/useFingerprint";
import { PageHeader } from "../../components/AppShell";
import { ErrorNotice, Notice } from "../../components/Notice";
import { QrFrameDisplay } from "../../components/QrFrameDisplay";
import { useFrames } from "../packet-transfer/useFrames";

export function ReviewRequestPage() {
  const { requestId = "" } = useParams();
  const device = useDevice();
  const request = useLiveQuery(async () => (await device.db.joinRequests.get(requestId)) ?? null, [requestId]);
  const community = useLiveQuery(
    () => (request ? device.db.communities.get(request.communityId) : undefined),
    [request?.communityId],
  );
  const memberFingerprint = useFingerprint(request?.signingPublicJwk);
  const approve = useAction(() => approveJoinRequest(device, requestId));
  const reject = useAction(() => rejectJoinRequest(device, requestId));
  const { frames, error: frameError } = useFrames(request?.status === "APPROVED" ? request.approvalPayload : null);

  if (request === undefined) return null;
  if (request === null) return <PageHeader title="Request not found" back="/" />;
  const back = `/c/${encodeURIComponent(request.communityId)}`;

  return (
    <div className="space-y-4">
      <PageHeader title={`Join request: ${request.displayName}`} back={back} subtitle={community?.name} />

      <div className="card space-y-2 text-sm">
        <p>
          <span className="font-semibold">Display name:</span> {request.displayName}
        </p>
        <p>
          <span className="font-semibold">Received:</span> {formatTime(request.receivedAt)}
        </p>
        <div>
          <p className="font-semibold">Member key fingerprint</p>
          <p className="mono text-base">{memberFingerprint}</p>
          <p className="muted">Check that this matches the fingerprint on their screen.</p>
        </div>
      </div>

      {request.status === "PENDING" && (
        <>
          <Notice>Approving signs a membership certificate and gives this device's community key to them only.</Notice>
          <ErrorNotice error={approve.error ?? reject.error} />
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void reject.run()}
              disabled={approve.pending || reject.pending}
            >
              Reject
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void approve.run()}
              disabled={approve.pending || reject.pending}
            >
              {approve.pending ? "Approving…" : "Approve"}
            </button>
          </div>
        </>
      )}

      {request.status === "APPROVED" && (
        <>
          <Notice tone="attention" title={`Show this approval only to ${request.displayName}.`}>
            It contains the community key encrypted for their device.
          </Notice>
          <ErrorNotice error={frameError} />
          {frames && <QrFrameDisplay frames={frames} label="Join approval" />}
          <Link to={back} className="btn-secondary w-full">
            Done
          </Link>
        </>
      )}

      {(request.status === "REJECTED" || request.status === "EXPIRED") && (
        <Notice title={`This request is ${request.status.toLowerCase()}.`} />
      )}
    </div>
  );
}
