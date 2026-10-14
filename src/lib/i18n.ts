import { create } from "zustand";

/**
 * Minimal, dependency-free i18n layer.
 *
 * Each feature module owns its own message bundle and registers it with fully
 * qualified keys, so translations live next to the code that uses them instead
 * of in one contended file.
 */

export type Locale = "zh-CN" | "en";

export const LOCALES: { value: Locale; label: string }[] = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" },
];

export type MessageBundle = Record<string, Partial<Record<Locale, string>>>;

const registry = new Map<string, Partial<Record<Locale, string>>>();

export function registerMessages(bundle: MessageBundle): void {
  for (const [key, translations] of Object.entries(bundle)) {
    const existing = registry.get(key);
    registry.set(key, existing ? { ...existing, ...translations } : translations);
  }
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: "zh-CN",
  setLocale: (locale) => {
    set({ locale });
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  },
}));

export function setLocale(locale: Locale): void {
  useLocaleStore.getState().setLocale(locale);
}

export type TranslateParams = Record<string, string | number>;

export function translate(
  locale: Locale,
  key: string,
  params?: TranslateParams,
): string {
  const entry = registry.get(key);
  const raw = entry?.[locale] ?? entry?.["zh-CN"] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Reactive translator bound to the current locale. */
export function useT(): (key: string, params?: TranslateParams) => string {
  const locale = useLocaleStore((state) => state.locale);
  return (key, params) => translate(locale, key, params);
}

export function t(key: string, params?: TranslateParams): string {
  return translate(useLocaleStore.getState().locale, key, params);
}

/** Test helper: clears the registry so bundles can be re-registered. */
export function __resetMessages(): void {
  registry.clear();
}
