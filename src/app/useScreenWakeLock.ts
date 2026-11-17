import { useEffect } from "react";

/**
 * Keep the screen on while `active`, so a phone showing QR frames does not dim
 * or lock in the middle of a handoff. Best effort: unsupported browsers, battery
 * saver or a denied request leave the screen timeout unchanged. Browsers drop
 * the lock when the page is hidden, so it is requested again on return.
 */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (stopped) void lock.release().catch(() => undefined);
        else sentinel = lock;
      } catch {
        // Not allowed right now; the QR display works without it.
      }
    };
    const onVisibility = () => void acquire();

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
