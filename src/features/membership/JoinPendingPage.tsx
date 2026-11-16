import { useLiveQuery } from "dexie-react-hooks";
import { ScanLine } from "lucide-react";
import { Link, useParams } from "react-router";
import { useDevice } from "../../app/providers/DeviceProvider";
import { formatRemaining } from "../../app/useAction";
import { useFingerprint } from "../../app/useFingerprint";
import { PageHeader } from "../../components/AppShell";
import { ErrorNotice, Notice } from "../../components/Notice";
import { QrFrameDisplay } from "../../components/QrFrameDisplay";
import { useFrames } from "../packet-transfer/useFrames";

export function JoinPendingPage() {
  const { requestId = "" } = useParams();
  const device = useDevice();
  const request = useLiveQuery(async () => (await device.db.pendingJoinRequests.get(requestId)) ?? null, [requestId]);
  const identity = useLiveQuery(() => device.db.localIdentity.get("local"), []);
  const ownFingerprint = useFingerprint(identity?.signingPublicJwk);
  const { frames, error } = useFrames(request?.status === "WAITING_FOR_APPROVAL" ? request.requestPayload : null);

  if (request === undefined) return null;
  if (request === null) return <PageHeader title="Join request not found" back="/" />;

  if (request.status === "ACCEPTED") {
    return (
      <div className="space-y-4">
        <PageHeader title={`You joined ${request.communityName}`} back="/" />
        <Notice title="Approval accepted on this device.">
          The community key is stored encrypted on this device. You can now read and carry community messages.
        </Notice>
        <Link to={`/c/${encodeURIComponent(request.communityId)}`} className="btn-primary w-full">
          Open community
        </Link>
      </div>
    );
  }

  const expired = request.status === "EXPIRED" || request.expiresAt <= device.now();
  return (
    <div className="space-y-4">
      <PageHeader title={`Join ${request.communityName}`} back="/" subtitle="Step 2 of 3: show this to the administrator." />
      {expired ? (
        <Notice tone="attention" title="This join request has expired.">
          Ask the administrator for a new invitation.
        </Notice>
      ) : (
        <>
          <ErrorNotice error={error} />
          {frames && <QrFrameDisplay frames={frames} label="Join request" />}
          <p className="text-center text-sm muted">Expires in {formatRemaining(request.expiresAt - device.now())}</p>
          <div className="card text-sm">
            <p className="font-semibold">Your key fingerprint</p>
            <p className="mono mt-1 text-base">{ownFingerprint}</p>
            <p className="mt-1 muted">The administrator sees this before approving you.</p>
          </div>
          <Notice tone="attention" title="Next: scan the approval">
            This approval contains the community key encrypted for this device. Do not share the approval QR.
          </Notice>
          <Link to="/scan" className="btn-primary w-full">
            <ScanLine size={20} aria-hidden="true" /> Scan approval
          </Link>
        </>
      )}
    </div>
  );
}
