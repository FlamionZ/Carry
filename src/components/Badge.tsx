import type { Clock } from "lucide-react";
import type { ReactNode } from "react";

export type BadgeIcon = typeof Clock;

/**
 * The one pill shape for status words, message kinds and relay journey
 * markers: an icon plus a text label, never colour alone. `tone` sets the colours.
 */
export function Badge({ Icon, tone, children }: { Icon: BadgeIcon; tone: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      <Icon size={14} aria-hidden="true" />
      {children}
    </span>
  );
}
