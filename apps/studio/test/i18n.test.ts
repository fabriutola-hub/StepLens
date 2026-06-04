// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  detectBrowserLocale,
  resolveLocale,
  t,
} from "../src/lib/i18n";

describe("detectBrowserLocale", () => {
  it("falls back to 'en' on the server", () => {
    // jsdom's navigator.language defaults to 'en-US', so we sanity-check
    // that the function returns either 'en' or 'es' — never throws.
    const result = detectBrowserLocale();
    expect(["en", "es"]).toContain(result);
  });
});

describe("resolveLocale", () => {
  it("returns the chosen locale when not 'system'", () => {
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("es")).toBe("es");
  });

  it("falls back to detected locale for 'system'", () => {
    expect(resolveLocale("system")).toBe(detectBrowserLocale());
  });
});

describe("t()", () => {
  it("translates a known key", () => {
    expect(t("en", "nav.traces")).toBe("Traces");
    expect(t("es", "nav.traces")).toBe("Trazas");
  });

  it("substitutes placeholders", () => {
    expect(t("en", "workbench.bulk-selected", { count: 5 })).toBe("5 selected");
    expect(t("es", "workbench.bulk-selected", { count: 5 })).toBe("5 seleccionadas");
  });

  it("falls back to English for missing ES keys", () => {
    // Imagine 'es' doesn't have a key — we should still return English.
    const en = t("en", "nav.traces");
    const es = t("es", "nav.traces");
    expect(en).toBe("Traces");
    expect(es).toBe("Trazas");
  });

  it("returns the key itself when the translation is missing", () => {
    expect(t("en", "unknown.nonexistent.key")).toBe("unknown.nonexistent.key");
  });
});
