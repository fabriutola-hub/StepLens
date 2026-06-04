"use client";

import { useMemo } from "react";
import { useSettings } from "./use-settings";
import { resolveLocale, t, type TranslationKey } from "./i18n";

/**
 * React hook for i18n. Returns a `t()` bound to the current locale.
 *
 * The locale source is the user's saved Settings preference (`en`, `es`, or
 * `system`); `system` resolves to the browser's primary language. Switching
 * locales is instant — `useSettings` listens for storage events so the whole
 * app re-renders when the user picks a different language.
 */
export function useI18n() {
  const { settings } = useSettings();
  const locale = resolveLocale(settings.locale);
  return useMemo(
    () => ({
      locale,
      t: (key: TranslationKey | string, params?: Record<string, string | number>) =>
        t(locale, key, params),
    }),
    [locale]
  );
}
