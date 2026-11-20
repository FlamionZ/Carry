import { ArrowRightLeft, HandHelping, Megaphone } from "lucide-react";
import type { MessageKind } from "../domain/packet/schemas";

// Words from GLOSSARY.md "Message kind". Teal/green stays reserved for Acknowledged.
export const MESSAGE_KIND_UI: Record<MessageKind, { label: string; hint: string; Icon: typeof Megaphone }> = {
  ANNOUNCEMENT: { label: "Announcement", hint: "General information", Icon: Megaphone },
  CHANGE: { label: "Change", hint: "A new time or place", Icon: ArrowRightLeft },
  REQUEST: { label: "Request", hint: "Ask members for something", Icon: HandHelping },
};

/** Icon plus text label, never colour alone. */
export function MessageKindBadge({ kind }: { kind: MessageKind }) {
  const { label, Icon } = MESSAGE_KIND_UI[kind];
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-forest/30 bg-white px-2.5 py-1 text-xs font-semibold text-forest">
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  );
}
