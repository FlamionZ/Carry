import { CheckCheck, Clock, Inbox, PenLine, QrCode, Repeat } from "lucide-react";
import type { StatusLabel } from "../domain/packet/rules";
import { Badge, type BadgeIcon } from "./Badge";

// Words come from statusLabel() in domain/packet/rules.ts; this only styles them.
const STYLES: Record<StatusLabel, { tone: string; Icon: BadgeIcon }> = {
  Created: { tone: "bg-amber/25 text-amber-dark", Icon: PenLine },
  // Displayed as frames; whether anyone scanned them is not observable.
  Shown: { tone: "bg-forest/10 text-forest", Icon: QrCode },
  Received: { tone: "bg-forest/10 text-forest", Icon: Inbox },
  "Shown for relay": { tone: "bg-forest/10 text-forest", Icon: Repeat },
  // Teal/green is reserved for an acknowledgement scanned on this device.
  Acknowledged: { tone: "bg-teal/15 text-teal-dark", Icon: CheckCheck },
  Expired: { tone: "bg-sage/20 text-sage-dark", Icon: Clock },
};

export function StatusBadge({ label }: { label: StatusLabel }) {
  const { tone, Icon } = STYLES[label];
  return (
    <Badge Icon={Icon} tone={tone}>
      {label}
    </Badge>
  );
}
