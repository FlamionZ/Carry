/**
 * CARRY mark: an open circular route with three connected nodes
 * (sender, relay, recipient). Nodes share one color by design.
 */
export function CarryMark({ size = 32, onDark = false }: { size?: number; onDark?: boolean }) {
  const ring = "#2AA58F";
  const node = onDark ? "#F4F2EA" : "#163A35";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="CARRY" focusable="false">
      <path
        d="M51.70 28.53 A20 20 0 1 1 35.47 12.30"
        fill="none"
        stroke={ring}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="51.70" cy="28.53" r="6" fill={node} stroke={ring} strokeWidth="3" />
      <circle cx="17.86" cy="46.14" r="6" fill={node} stroke={ring} strokeWidth="3" />
      <circle cx="35.47" cy="12.30" r="6" fill={node} stroke={ring} strokeWidth="3" />
    </svg>
  );
}

export function Wordmark({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <CarryMark size={28} onDark={onDark} />
      <span
        className={`font-display text-lg font-bold tracking-[0.18em] ${onDark ? "text-white" : "text-forest"}`}
        aria-hidden="true"
      >
        CARRY
      </span>
    </span>
  );
}
