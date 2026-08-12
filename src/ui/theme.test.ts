import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  applyTheme,
  normalizeTheme,
  readStoredTheme,
  THEME_STORAGE_KEY,
  toggleTheme,
  writeStoredTheme,
} from "./theme";

describe("theme", () => {
  const store = new Map<string, string>();
  const setAttribute = vi.fn<(name: string, value: string) => void>();

  beforeEach(() => {
    store.clear();
    setAttribute.mockReset();

    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, String(value));
      }),
    });

    vi.stubGlobal("document", {
      documentElement: {
        setAttribute,
        getAttribute: vi.fn((name: string) => {
          if (name !== "data-theme") return null;
          const call = [...setAttribute.mock.calls]
            .reverse()
            .find((entry) => entry[0] === "data-theme");
          return call ? call[1] : null;
        }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes to dark unless explicit light", () => {
    expect(normalizeTheme("dark")).toBe("dark");
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("other")).toBe("dark");
    expect(normalizeTheme(null)).toBe("dark");
  });

  it("writes and reads storage values", () => {
    writeStoredTheme("light");
    expect(store.get(THEME_STORAGE_KEY)).toBe("light");
    expect(readStoredTheme()).toBe("light");
  });

  it("applyTheme persists and updates document theme", () => {
    applyTheme("light");
    expect(setAttribute).toHaveBeenCalledWith("data-theme", "light");
    expect(readStoredTheme()).toBe("light");
  });

  it("toggleTheme switches both ways", () => {
    applyTheme("dark");
    expect(toggleTheme()).toBe("light");
    expect(toggleTheme()).toBe("dark");
  });
});