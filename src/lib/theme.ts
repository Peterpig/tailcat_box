import type { ThemeMode } from "./types";

export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "tailcat-box.theme";

export function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === "system" ? systemTheme() : mode;
}

export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", resolved);
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* localStorage can be unavailable in locked-down webviews. */
  }
  return resolved;
}

export function readStoredThemeMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return "system";
}

/** Applies the stored theme before React mounts to avoid a flash. */
export function applyStoredTheme(): ResolvedTheme {
  return applyTheme(readStoredThemeMode());
}

export function watchSystemTheme(onChange: (theme: ResolvedTheme) => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia("(prefers-color-scheme: light)");
  const listener = () => onChange(query.matches ? "light" : "dark");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
