import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { describeError } from "../domain/errors";

type Tone = "info" | "attention" | "error";

const TONES: Record<Tone, { className: string; Icon: typeof Info }> = {
  info: { className: "border-forest/20 bg-forest/5 text-ink", Icon: Info },
  attention: { className: "border-amber bg-amber/15 text-ink", Icon: AlertTriangle },
  error: { className: "border-alert bg-alert/10 text-ink", Icon: ShieldAlert },
};

export function Notice({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  const { className, Icon } = TONES[tone];
  return (
    <div className={`flex gap-3 rounded-control border p-3 ${className}`} role={tone === "error" ? "alert" : "note"}>
      <Icon size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const { code, message } = describeError(error);
  return (
    <Notice tone="error" title={message}>
      <p className="mono mt-1 text-xs muted">{code}</p>
    </Notice>
  );
}
