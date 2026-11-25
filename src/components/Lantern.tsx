/**
 * The Kiroween lantern (BRAND_GUIDELINES §12): a small warm light carried hand
 * to hand. Decorative only. It glows softly via `.lantern-glow`, which does not
 * animate under reduced motion. Inline SVG, no network.
 */
export function Lantern({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      className={`lantern-glow ${className}`}
    >
      {/* handle */}
      <path d="M17 11 C17 4, 31 4, 31 11" fill="none" stroke="#81918A" strokeWidth="2.5" strokeLinecap="round" />
      {/* cap */}
      <rect x="14" y="10" width="20" height="5" rx="2" fill="#81918A" />
      {/* glass with the flame */}
      <rect x="15" y="15" width="18" height="22" rx="5" fill="#F1B45B" fillOpacity="0.22" stroke="#F1B45B" strokeWidth="2" />
      <path d="M24 20 C27 24, 27.5 27, 24 31 C20.5 27, 21 24, 24 20 Z" fill="#F1B45B" />
      {/* base */}
      <rect x="13" y="37" width="22" height="5" rx="2" fill="#81918A" />
    </svg>
  );
}
