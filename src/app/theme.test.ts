import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, type PreferenceStore, parseTheme, readTheme, THEME_KEY, writeTheme } from "./theme";

function memoryStore(initial: Record<string, string> = {}): PreferenceStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key]! : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const brokenStore: PreferenceStore = {
  getItem: () => {
    throw new Error("storage unavailable");
  },
  setItem: () => {
    throw new Error("storage unavailable");
  },
};

describe("theme preference", () => {
  it("defaults to the Kiroween night theme", () => {
    expect(DEFAULT_THEME).toBe("night");
    expect(readTheme(memoryStore())).toBe("night");
  });

  it("reads back a stored choice", () => {
    const store = memoryStore();
    writeTheme(store, "light");
    expect(store.data[THEME_KEY]).toBe("light");
    expect(readTheme(store)).toBe("light");
    writeTheme(store, "night");
    expect(readTheme(store)).toBe("night");
  });

  it("ignores unknown stored values", () => {
    for (const value of ["dark", "", "LIGHT", null, undefined]) expect(parseTheme(value)).toBe("night");
    expect(readTheme(memoryStore({ [THEME_KEY]: "sepia" }))).toBe("night");
  });

  it("falls back to night when storage is unavailable", () => {
    expect(readTheme(brokenStore)).toBe("night");
    expect(() => writeTheme(brokenStore, "light")).not.toThrow();
  });
});
