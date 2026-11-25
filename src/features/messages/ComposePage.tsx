import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { composeMessage } from "../../application/use-cases/packets";
import { useDevice } from "../../app/providers/DeviceProvider";
import { useAction } from "../../app/useAction";
import { PageHeader } from "../../components/AppShell";
import { ErrorNotice } from "../../components/Notice";
import { MESSAGE_KIND_UI } from "../../components/MessageKindBadge";
import { LIMITS } from "../../domain/limits";
import { DEFAULT_MESSAGE_KIND, MESSAGE_KINDS, type MessageKind } from "../../domain/packet/schemas";

export function ComposePage() {
  const { communityId = "" } = useParams();
  const device = useDevice();
  const navigate = useNavigate();
  const community = useLiveQuery(() => device.db.communities.get(communityId), [communityId]);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<MessageKind>(DEFAULT_MESSAGE_KIND);
  const { run, pending, error } = useAction(async () => {
    const record = await composeMessage(device, communityId, text, kind);
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
        <fieldset className="space-y-2">
          <legend className="label">Message kind</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {MESSAGE_KINDS.map((k) => {
              const { label, hint, Icon } = MESSAGE_KIND_UI[k];
              return (
                <label key={k} className="block cursor-pointer">
                  <input
                    type="radio"
                    name="message-kind"
                    value={k}
                    className="peer sr-only"
                    checked={kind === k}
                    onChange={() => setKind(k)}
                    aria-labelledby={`kind-label-${k}`}
                    aria-describedby={`kind-hint-${k}`}
                  />
                  <span className="flex min-h-14 items-center gap-3 rounded-control border-2 border-sage bg-surface px-3 py-2 text-fg peer-checked:border-forest peer-checked:bg-forest/5 peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-dark">
                    <Icon size={22} aria-hidden="true" />
                    <span className="flex flex-col">
                      <span id={`kind-label-${k}`} className="font-semibold">
                        {label}
                      </span>
                      <span id={`kind-hint-${k}`} className="text-xs muted">
                        {hint}
                      </span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
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
        <p id="message-help" className={`text-sm ${remaining < 0 ? "text-alert-dark" : "muted"}`}>
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
