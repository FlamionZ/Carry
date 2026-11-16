import { ShieldCheck, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { checkOfflineReadiness, type OfflineReadiness } from "../infrastructure/pwa/readiness";
import { subscribeServiceWorker } from "../infrastructure/pwa/register";

export function useOfflineReadiness(): [OfflineReadiness | null, () => void] {
  const [state, setState] = useState<OfflineReadiness | null>(null);
  // checkOfflineReadiness never rejects; it reports failures as "not ready".
  const refresh = () => void checkOfflineReadiness().then(setState);
  useEffect(() => {
    refresh();
    const unsubscribe = subscribeServiceWorker(() => refresh());
    navigator.serviceWorker?.addEventListener("controllerchange", refresh);
    return () => {
      unsubscribe();
      navigator.serviceWorker?.removeEventListener("controllerchange", refresh);
    };
  }, []);
  return [state, refresh];
}

export function OfflineBadge() {
  const [state] = useOfflineReadiness();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const ready = state?.ready;
  return (
    <span className="flex items-center gap-2 text-xs font-semibold">
      {!online && (
        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-white">
          <WifiOff size={14} aria-hidden="true" /> No connection
        </span>
      )}
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${
          ready ? "bg-teal text-ink" : "bg-amber text-ink"
        }`}
        title={ready ? "App shell cached for offline use" : "Open once online in the built app to cache it"}
      >
        <ShieldCheck size={14} aria-hidden="true" />
        {ready ? "Offline-ready" : "Not offline-ready"}
      </span>
    </span>
  );
}
