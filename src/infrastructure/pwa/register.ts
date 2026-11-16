import { registerSW } from "virtual:pwa-register";

type Listener = (state: { needRefresh: boolean; offlineReady: boolean }) => void;

let state = { needRefresh: false, offlineReady: false };
const listeners = new Set<Listener>();
let update: ((reload?: boolean) => Promise<void>) | undefined;

function emit(next: Partial<typeof state>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l(state));
}

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  update = registerSW({
    immediate: true,
    onNeedRefresh: () => emit({ needRefresh: true }),
    onOfflineReady: () => emit({ offlineReady: true }),
  });
}

export function subscribeServiceWorker(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function applyServiceWorkerUpdate(): void {
  void update?.(true);
}
