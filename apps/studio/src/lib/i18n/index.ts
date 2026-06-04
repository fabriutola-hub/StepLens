/**
 * Tiny i18n — runtime locale detection, JSON dictionaries, no external lib.
 *
 * Why custom: official i18n libs (next-intl, react-i18next, lingui) all want
 * to take over the bundle and the routing. We only need ~120 short strings,
 * a `t()` function, and graceful fallback to English. That's ~80 lines.
 */
import type { Locale } from "../settings-store";
import { en } from "./locales/en";
import { es } from "./locales/es";

export type TranslationKey = keyof typeof en;

const DICTIONARIES: Record<Locale, Record<string, string>> = {
  en,
  es,
};

/** Browser-preferred locale, narrowed to the locales we ship. */
export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  for (const tag of navigator.languages ?? [navigator.language]) {
    const head = tag.toLowerCase().split("-")[0];
    if (head === "es") return "es";
    if (head === "en") return "en";
  }
  return "en";
}

/** Resolve a "system" preference to a real locale. */
export function resolveLocale(pref: Locale | "system"): Locale {
  if (pref === "system") return detectBrowserLocale();
  return pref;
}

/**
 * Translate a key. Optional placeholders are substituted via `{name}` syntax.
 *
 * Missing-key behaviour: return the key itself, so debugging is obvious in
 * the UI (you see "workbench.search" instead of an empty string) without
 * crashing or hiding text.
 */
export function t(
  locale: Locale,
  key: TranslationKey | string,
  params?: Record<string, string | number>
): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES.en;
  const raw = dict[key as string] ?? DICTIONARIES.en[key as string] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name) =>
    name in params ? String(params[name]) : `{${name}}`
  );
}

export { en, es };
