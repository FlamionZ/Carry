import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useNavigate } from "react-router";
import { createJoinRequest } from "../../application/use-cases/membership";
import { useDevice } from "../../app/providers/DeviceProvider";
import { formatRemaining, useAction } from "../../app/useAction";
import { ErrorNotice } from "../../components/Notice";
import { LIMITS } from "../../domain/limits";
import type { InvitePayload } from "../../domain/packet/schemas";

/** Shown after a valid INVITE is scanned. Nothing is stored until the user confirms. */
export function JoinFromInvite({
  invite,
  fingerprint,
  onCancel,
}: {
  invite: InvitePayload;
  fingerprint: string;
  onCancel: () => void;
}) {
  const device = useDevice();
  const navigate = useNavigate();
  const identity = useLiveQuery(() => device.db.localIdentity.get("local"), []);
  const [name, setName] = useState<string | null>(null);
  const displayName = name ?? identity?.displayName ?? "";

  const { run, pending, error } = useAction(async () => {
    const request = await createJoinRequest(device, invite, displayName);
    navigate(`/join/${encodeURIComponent(request.id)}`, { replace: true });
  });

  return (
    <div className="card space-y-4">
      <div>
        <p className="text-sm muted">Invitation to join</p>
        <h2 className="text-2xl text-forest">{invite.communityName}</h2>
        <p className="mt-1 text-sm muted">Expires in {formatRemaining(invite.expiresAt - device.now())}</p>
      </div>
      <div className="rounded-control bg-paper p-3 text-sm">
        <p className="font-semibold">Admin key fingerprint</p>
        <p className="mono mt-1 text-base">{fingerprint}</p>
        <p className="mt-1 muted">Ask the organizer to confirm their screen shows the same fingerprint.</p>
      </div>
      <div>
        <label className="label" htmlFor="join-name">
          Your display name in this community
        </label>
        <input
          id="join-name"
          className="input"
          value={displayName}
          maxLength={LIMITS.maxNameLength}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <ErrorNotice error={error} />
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Not now
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => void run()}
          disabled={pending || !displayName.trim()}
        >
          Request to join
        </button>
      </div>
    </div>
  );
}
