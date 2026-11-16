import { useLiveQuery } from "dexie-react-hooks";
import { ScanLine } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { type CreatedInvite, createInvite } from "../../application/use-cases/membership";
import { useDevice } from "../../app/providers/DeviceProvider";
import { formatRemaining, useAction } from "../../app/useAction";
import { PageHeader } from "../../components/AppShell";
import { ErrorNotice, Notice } from "../../components/Notice";
import { QrFrameDisplay } from "../../components/QrFrameDisplay";
import { useFrames } from "../packet-transfer/useFrames";

export function InvitePage() {
  const { communityId = "" } = useParams();
  const device = useDevice();
  const community = useLiveQuery(() => device.db.communities.get(communityId), [communityId]);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const { run, pending, error } = useAction(async () => setCreated(await createInvite(device, communityId)));
  const { frames, error: frameError } = useFrames(created?.encoded);
  const [now, setNow] = useState(device.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(device.now()), 15_000);
    return () => window.clearInterval(id);
  }, [device]);

  const invite = useLiveQuery(
    async () => (created ? await device.db.invites.get(created.invite.id) : undefined),
    [created?.invite.id],
  );
  const back = `/c/${encodeURIComponent(communityId)}`;

  return (
    <div className="space-y-4">
      <PageHeader title="Invite a member" back={back} subtitle={community?.name} />
      <Notice tone="attention" title="Share this invitation only with people you trust.">
        Anyone who obtains it can request to join, but the administrator must approve each request. The invitation
        does not contain the community key.
      </Notice>

      {!created && (
        <>
          <ErrorNotice error={error} />
          <button type="button" className="btn-primary w-full" onClick={() => void run()} disabled={pending}>
            {pending ? "Preparing…" : "Show invitation QR"}
          </button>
        </>
      )}

      {created && (
        <>
          {invite && invite.status !== "ACTIVE" ? (
            <Notice title={`This invitation is ${invite.status.toLowerCase()}.`}>
              Create a new invitation for the next person.
            </Notice>
          ) : (
            <p className="text-center font-semibold">
              {created.invite.expiresAt > now
                ? `This invite expires in ${formatRemaining(created.invite.expiresAt - now)}. Single use.`
                : "This invite has expired."}
            </p>
          )}
          <ErrorNotice error={frameError} />
          {frames && <QrFrameDisplay frames={frames} label={`Invitation to ${created.payload.communityName}`} />}
          <div className="card text-sm">
            <p className="font-semibold">Admin key fingerprint</p>
            <p className="mono mt-1 text-base">{created.payload.adminFingerprint}</p>
            <p className="mt-1 muted">The joining person can compare this with what their screen shows.</p>
          </div>
          <Link to="/scan" className="btn-primary w-full">
            <ScanLine size={20} aria-hidden="true" /> Next: scan their join request
          </Link>
        </>
      )}
    </div>
  );
}
