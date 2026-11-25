import { ArrowRightLeft, HandHelping, Megaphone } from "lucide-react";
import type { MessageKind } from "../domain/packet/schemas";
import { Badge, type BadgeIcon } from "./Badge";

// Words from GLOSSARY.md "Message kind". Teal/green stays reserved for Acknowledged.
export const MESSAGE_KIND_UI: Record<MessageKind, { label: string; hint: string; Icon: BadgeIcon }> = {
  ANNOUNCEMENT: { label: "Announcement", hint: "General information", Icon: Megaphone },
  CHANGE: { label: "Change", hint: "A new time or place", Icon: ArrowRightLeft },
  REQUEST: { label: "Request", hint: "Ask members for something", Icon: HandHelping },
};

/** Icon plus text label, never colour alone. */
export function MessageKindBadge({ kind }: { kind: MessageKind }) {
  const { label, Icon } = MESSAGE_KIND_UI[kind];
  return (
    <Badge Icon={Icon} tone="border border-forest/30 bg-surface text-accent">
      {label}
    </Badge>
  );
}
