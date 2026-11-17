/** The user asked the OS/browser for less motion (BRAND_GUIDELINES.md §10). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** JS-driven smooth scrolling ignores the CSS reduced-motion rule, so pick the behavior here. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
