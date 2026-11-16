export interface OfflineReadiness {
  supported: boolean;
  controlled: boolean;
  precacheFound: boolean;
  shellCached: boolean;
  cachedEntries: number;
  /** Same-origin scripts, styles, fonts and icons this page loaded. */
  requiredAssets: number;
  missingAssets: string[];
  ready: boolean;
}

/** URLs of the assets the running page depends on (hashed bundles, CSS, fonts, manifest, icons). */
function requiredAssetUrls(): string[] {
  const urls = new Set<string>();
  document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((s) => urls.add(s.src));
  document
    .querySelectorAll<HTMLLinkElement>(
      'link[rel="stylesheet"], link[rel="modulepreload"], link[rel="manifest"], link[rel="icon"], link[rel="apple-touch-icon"]',
    )
    .forEach((l) => urls.add(l.href));
  for (const entry of performance.getEntriesByType("resource")) {
    if (/\.woff2(\?|$)/.test(entry.name)) urls.add(entry.name);
  }
  return [...urls].filter((u) => new URL(u).origin === location.origin);
}

/**
 * Offline-readiness test (ARCHITECTURE.md §8): the page is controlled by the
 * service worker, the precache holds the app shell, and every asset this page
 * loaded is in the precache.
 */
export async function checkOfflineReadiness(): Promise<OfflineReadiness> {
  const supported = "serviceWorker" in navigator && "caches" in window;
  const result: OfflineReadiness = {
    supported,
    controlled: false,
    precacheFound: false,
    shellCached: false,
    cachedEntries: 0,
    requiredAssets: 0,
    missingAssets: [],
    ready: false,
  };
  if (!supported) return result;

  result.controlled = !!navigator.serviceWorker.controller;
  try {
    const names = (await caches.keys()).filter((n) => n.includes("carry") && n.includes("precache"));
    result.precacheFound = names.length > 0;
    const precaches = await Promise.all(names.map((n) => caches.open(n)));
    for (const cache of precaches) {
      result.cachedEntries += (await cache.keys()).length;
      if (await cache.match("/index.html", { ignoreSearch: true })) result.shellCached = true;
    }
    const required = requiredAssetUrls();
    result.requiredAssets = required.length;
    for (const url of required) {
      const hits = await Promise.all(precaches.map((c) => c.match(url, { ignoreSearch: true })));
      if (!hits.some(Boolean)) result.missingAssets.push(new URL(url).pathname);
    }
  } catch {
    // Cache API can be unavailable in some private modes.
  }
  result.ready =
    result.controlled && result.precacheFound && result.shellCached && result.missingAssets.length === 0;
  return result;
}

/** Ask the browser not to evict CARRY's IndexedDB under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
