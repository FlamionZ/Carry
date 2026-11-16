import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { composeMessage } from "../../application/use-cases/packets";
import { useDevice } from "../../app/providers/DeviceProvider";
import { useAction } from "../../app/useAction";
import { PageHeader } from "../../components/AppShell";
import { ErrorNotice } from "../../components/Notice";
import { LIMITS } from "../../domain/limits";

export function ComposePage() {
  const { communityId = "" } = useParams();
  const device = useDevice();
  const navigate = useNavigate();
  const community = useLiveQuery(() => device.db.communities.get(communityId), [communityId]);
  const [text, setText] = useState("");
  const { run, pending, error } = useAction(async () => {
    const record = await composeMessage(device, communityId, text);
    navigate(`/p/${encodeURIComponent(record.id)}?show=1`, { replace: true });
  });
  const remaining = LIMITS.maxMessageLength - text.trim().length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Write a message"
        back={`/c/${encodeURIComponent(communityId)}`}
        subtitle={community ? `To ${community.name}. Encrypted for members only.` : undefined}
      />
      <form
        className="card space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <label className="label" htmlFor="message-text">
          Message
        </label>
        <textarea
          id="message-text"
          className="input h-40 py-3"
          value={text}
          maxLength={LIMITS.maxMessageLength + 40}
          onChange={(e) => setText(e.target.value)}
          placeholder="Meet at the north entrance. Bring the first-aid kit."
          aria-describedby="message-help"
        />
        <p id="message-help" className={`text-sm ${remaining < 0 ? "text-alert" : "muted"}`}>
          {remaining >= 0 ? `${remaining} characters left.` : `${-remaining} characters over the limit.`} Short
          messages need fewer QR frames. Messages expire after 24 hours.
        </p>
        <ErrorNotice error={error} />
        <button type="submit" className="btn-primary w-full" disabled={pending || !text.trim() || remaining < 0}>
          {pending ? "Encrypting…" : "Create packet"}
        </button>
      </form>
    </div>
  );
}
