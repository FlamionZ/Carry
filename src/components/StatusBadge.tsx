import { CheckCheck, Clock, Inbox, PenLine, QrCode, Repeat, ShieldAlert } from "lucide-react";
import type { StatusLabel } from "../domain/packet/rules";

// Words come from statusLabel() in domain/packet/rules.ts; this only styles them.
const STYLES: Record<StatusLabel, { className: string; Icon: typeof Clock }> = {
  Created: { className: "bg-amber/25 text-amber-dark", Icon: PenLine },
  // Displayed as frames; whether anyone scanned them is not observable.
  Shown: { className: "bg-forest/10 text-forest", Icon: QrCode },
  Received: { className: "bg-forest/10 text-forest", Icon: Inbox },
  "Shown for relay": { className: "bg-forest/10 text-forest", Icon: Repeat },
  // Teal/green is reserved for an acknowledgement scanned on this device.
  Acknowledged: { className: "bg-teal/15 text-teal-dark", Icon: CheckCheck },
  Expired: { className: "bg-sage/20 text-sage-dark", Icon: Clock },
  Rejected: { className: "bg-alert/15 text-alert-dark", Icon: ShieldAlert },
};

export function StatusBadge({ label }: { label: StatusLabel }) {
  const { className, Icon } = STYLES[label];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  );
}
