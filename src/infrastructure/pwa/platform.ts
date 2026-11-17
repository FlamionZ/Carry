/** iPhone, iPod or iPad. iPadOS reports a Mac user agent, so touch support identifies it. */
export function isAppleMobile(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Running as an installed Home Screen app rather than in a browser tab. */
export function isStandalone(): boolean {
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return legacy || window.matchMedia?.("(display-mode: standalone)").matches === true;
}
