import { registerSW } from "virtual:pwa-register";

type Listener = (state: { needRefresh: boolean; offlineReady: boolean }) => void;

let state = { needRefresh: false, offlineReady: false };
const listeners = new Set<Listener>();
let update: ((reload?: boolean) => Promise<void>) | undefined;

function emit(next: Partial<typeof state>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l(state));
}

/**
 * Reload when a newer version takes over a page that an older version was
 * already serving: after "Reload to update" in this tab or another one. The old
 * code must not keep running against the new cache, where its lazily loaded
 * files no longer exist. The first install claiming a fresh page is not an
 * update, so it does not reload.
 */
function reloadWhenReplaced(): void {
  let hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController && !reloading) {
      reloading = true;
      window.location.reload();
    }
    hadController = true;
  });
}

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  reloadWhenReplaced();
  update = registerSW({
    immediate: true,
    // Only a page that a service worker already serves can be out of date. On a
    // first visit, a worker installed by an earlier load of the page (e.g. the
    // user navigated while the cache was filling) is reported the same way.
    onNeedRefresh: () => {
      if (navigator.serviceWorker.controller) emit({ needRefresh: true });
    },
    onOfflineReady: () => emit({ offlineReady: true }),
    // Reloading is handled by reloadWhenReplaced, which also covers tabs whose
    // registration started before any service worker existed.
    onNeedReload: () => undefined,
  });
}

export function subscribeServiceWorker(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

/** Activate the waiting version; reloadWhenReplaced reloads every open CARRY tab. */
export function applyServiceWorkerUpdate(): void {
  void update?.(true);
}
