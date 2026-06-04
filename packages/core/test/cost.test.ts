import { describe, it, expect } from "vitest";
import { calculateCost, lookupPricing } from "../src/cost.js";

describe("lookupPricing", () => {
  it("finds exact match for gpt-4o", () => {
    const pricing = lookupPricing("gpt-4o");
    expect(pricing).toBeDefined();
    expect(pricing!.inputPer1k).toBe(0.0025);
    expect(pricing!.outputPer1k).toBe(0.01);
  });

  it("finds exact match for claude-3-5-sonnet", () => {
    const pricing = lookupPricing("claude-3-5-sonnet-20241022");
    expect(pricing).toBeDefined();
    expect(pricing!.inputPer1k).toBe(0.003);
  });

  it("returns null for unknown model", () => {
    const pricing = lookupPricing("nonexistent-model");
    expect(pricing).toBeNull();
  });

  it("finds pricing for o1", () => {
    const pricing = lookupPricing("o1");
    expect(pricing).toBeDefined();
    expect(pricing!.inputPer1k).toBe(0.015);
    expect(pricing!.outputPer1k).toBe(0.06);
  });
});

describe("calculateCost", () => {
  it("calculates cost for gpt-4o", () => {
    const cost = calculateCost("gpt-4o", 1000, 500);
    // input: 1k * 0.0025 = 0.0025, output: 0.5k * 0.01 = 0.005
    // total = 0.0075
    expect(cost).toBeCloseTo(0.0075, 5);
  });

  it("calculates cost for claude-3-5-sonnet", () => {
    const cost = calculateCost("claude-3-5-sonnet-20241022", 3000, 2000);
    // input: 3 * 0.003 = 0.009, output: 2 * 0.015 = 0.03
    // total = 0.039
    expect(cost).toBeCloseTo(0.039, 5);
  });

  it("returns undefined for unknown model", () => {
    const cost = calculateCost("unknown-model", 100, 50);
    expect(cost).toBeUndefined();
  });

  it("calculates gpt-4o-mini correctly", () => {
    const cost = calculateCost("gpt-4o-mini", 10000, 5000);
    // input: 10 * 0.00015 = 0.0015, output: 5 * 0.0006 = 0.003
    expect(cost).toBeCloseTo(0.0045, 5);
  });

  it("handles zero tokens", () => {
    const cost = calculateCost("gpt-4o", 0, 0);
    expect(cost).toBe(0);
  });

  it("calculates o3-mini", () => {
    const cost = calculateCost("o3-mini", 500, 250);
    // input: 0.5 * 0.0015 = 0.00075, output: 0.25 * 0.006 = 0.0015
    expect(cost).toBeCloseTo(0.00225, 5);
  });

  it("calculates gemini-2.5-pro", () => {
    const cost = calculateCost("gemini-2.5-pro", 2000, 1000);
    // input: 2 * 0.00125 = 0.0025, output: 1 * 0.005 = 0.005
    expect(cost).toBeCloseTo(0.0075, 5);
  });

  it("calculates llama-3.1-70b", () => {
    const cost = calculateCost("llama-3.1-70b-instruct", 1000, 1000);
    // input: 1 * 0.0004, output: 1 * 0.0004
    expect(cost).toBeCloseTo(0.0008, 5);
  });
});
