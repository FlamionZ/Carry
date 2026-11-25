/**
 * Display theme preference (ADR-0002). Night is the default and needs no
 * attribute; Light sets data-theme="light" on <html>. Stored like the other
 * non-sensitive preferences; never stores keys or message data.
 */
export type Theme = "night" | "light";
export const THEMES: readonly Theme[] = ["night", "light"];
export const DEFAULT_THEME: Theme = "night";
export const THEME_KEY = "carry.theme";

/** Minimal storage surface so the helpers stay testable without a DOM. */
export interface PreferenceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function parseTheme(value: string | null | undefined): Theme {
  return value === "light" || value === "night" ? value : DEFAULT_THEME;
}

export function readTheme(store: PreferenceStore): Theme {
  try {
    return parseTheme(store.getItem(THEME_KEY));
  } catch {
    // Storage can be unavailable (private modes); fall back to the default.
    return DEFAULT_THEME;
  }
}

export function writeTheme(store: PreferenceStore, theme: Theme): void {
  try {
    store.setItem(THEME_KEY, theme);
  } catch {
    // Not persisted; the choice still applies for this page.
  }
}

/** Night is the stylesheet default, so only Light needs the attribute. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === "light") root.dataset.theme = "light";
  else delete root.dataset.theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = theme === "light" ? "#163A35" : "#0A0F0E";
}
