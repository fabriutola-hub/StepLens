// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_SETTINGS,
  mergeWithDefaults,
  readSettings,
  writeSettings,
  resetSettings,
  STORAGE_KEY_NAME,
} from "../src/lib/settings-store";

describe("settings-store", () => {
  beforeEach(() => {
    resetSettings();
  });

  it("returns defaults for missing key", () => {
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults for malformed JSON", () => {
    localStorage.setItem(STORAGE_KEY_NAME, "{ not valid");
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back per-field to defaults for missing/invalid values", () => {
    localStorage.setItem(
      STORAGE_KEY_NAME,
      JSON.stringify({
        pollIntervalMs: -1, // out of range → default
        defaultPageSize: 7, // not a valid PageSize → default
        compactMode: "yes", // wrong type → default
      })
    );
    const s = readSettings();
    expect(s.pollIntervalMs).toBe(DEFAULT_SETTINGS.pollIntervalMs);
    expect(s.defaultPageSize).toBe(DEFAULT_SETTINGS.defaultPageSize);
    expect(s.compactMode).toBe(DEFAULT_SETTINGS.compactMode);
  });

  it("roundtrips a complete valid settings blob", () => {
    writeSettings({
      pollIntervalMs: 5000,
      defaultPageSize: 50,
      compactMode: true,
      locale: "es",
      defaultSort: "name",
      liveUpdates: false,
      budget: { dailyUsd: 5, monthlyUsd: 100 },
    });
    const s = readSettings();
    expect(s.pollIntervalMs).toBe(5000);
    expect(s.defaultPageSize).toBe(50);
    expect(s.compactMode).toBe(true);
    expect(s.locale).toBe("es");
    expect(s.defaultSort).toBe("name");
    expect(s.liveUpdates).toBe(false);
    expect(s.budget.dailyUsd).toBe(5);
    expect(s.budget.monthlyUsd).toBe(100);
  });

  it("ignores negative or out-of-range budget values", () => {
    writeSettings({
      ...DEFAULT_SETTINGS,
      budget: { dailyUsd: -10, monthlyUsd: Number.NaN },
    });
    const s = readSettings();
    expect(s.budget.dailyUsd).toBe(0);
    expect(s.budget.monthlyUsd).toBe(0);
  });
});

describe("mergeWithDefaults", () => {
  it("returns defaults for empty input", () => {
    expect(mergeWithDefaults({})).toEqual(DEFAULT_SETTINGS);
  });

  it("preserves good values, replaces bad ones", () => {
    const merged = mergeWithDefaults({
      pollIntervalMs: 1500,
      defaultPageSize: 10,
      compactMode: true,
      locale: "en",
      defaultSort: "status",
      liveUpdates: true,
      budget: { dailyUsd: 1.5, monthlyUsd: 25 },
    });
    expect(merged.pollIntervalMs).toBe(1500);
    expect(merged.defaultPageSize).toBe(10);
    expect(merged.compactMode).toBe(true);
    expect(merged.budget.dailyUsd).toBe(1.5);
  });

  it("clamps poll interval into the [500, 60_000] window", () => {
    expect(mergeWithDefaults({ pollIntervalMs: 100 }).pollIntervalMs).toBe(
      DEFAULT_SETTINGS.pollIntervalMs
    );
    expect(mergeWithDefaults({ pollIntervalMs: 999_999 }).pollIntervalMs).toBe(
      DEFAULT_SETTINGS.pollIntervalMs
    );
  });
});
