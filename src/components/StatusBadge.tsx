import { CheckCheck, Clock, Inbox, Repeat, Send, ShieldAlert } from "lucide-react";
import type { PacketStatus } from "../domain/packet/rules";

const STYLES: Record<PacketStatus, { label: string; className: string; Icon: typeof Clock }> = {
  READY: { label: "Ready to pass along", className: "bg-amber/25 text-amber-dark", Icon: Send },
  IMPORTED: { label: "Received on this device", className: "bg-forest/10 text-forest", Icon: Inbox },
  // Set when the relay QR is shown; scanning by the next person is not observable.
  RELAYED: { label: "Shown for relay", className: "bg-forest/10 text-forest", Icon: Repeat },
  // Teal/green is reserved for a returned ACK.
  ACKNOWLEDGED: { label: "Acknowledged", className: "bg-teal/15 text-teal-dark", Icon: CheckCheck },
  EXPIRED: { label: "Expired", className: "bg-sage/20 text-sage-dark", Icon: Clock },
  REJECTED: { label: "Rejected", className: "bg-alert/15 text-alert-dark", Icon: ShieldAlert },
};

export function StatusBadge({ status }: { status: PacketStatus }) {
  const { label, className, Icon } = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  );
}
