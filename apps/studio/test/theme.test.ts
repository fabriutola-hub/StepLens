import { describe, it, expect } from "vitest";
import { THEME_INIT_SCRIPT } from "../src/lib/theme";

describe("THEME_INIT_SCRIPT", () => {
  it("is a self-executing IIFE", () => {
    expect(THEME_INIT_SCRIPT).toMatch(/^\(\(\) =>/);
    expect(THEME_INIT_SCRIPT).toMatch(/\)\(\);\s*$/);
  });

  it("reads the canonical storage key", () => {
    expect(THEME_INIT_SCRIPT).toContain('"steplens.theme"');
  });

  it("falls back to the system color-scheme media query", () => {
    expect(THEME_INIT_SCRIPT).toContain('matchMedia("(prefers-color-scheme: dark)")');
  });

  it("applies the dark class to the document element", () => {
    expect(THEME_INIT_SCRIPT).toContain('classList.toggle("dark"');
  });

  it("sets the color-scheme style for native form controls", () => {
    expect(THEME_INIT_SCRIPT).toContain("colorScheme = v");
  });

  it("swallows storage exceptions silently (private-mode safe)", () => {
    expect(THEME_INIT_SCRIPT).toMatch(/try\s*\{[\s\S]*\}\s*catch/);
  });
});
