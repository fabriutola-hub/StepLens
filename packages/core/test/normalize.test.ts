import { describe, it, expect } from "vitest";
import {
  normalizeEvent,
  normalizeError,
  calculateDuration,
  generateId,
} from "../src/normalize.js";

describe("generateId", () => {
  it("returns a UUID v4 string", () => {
    const id = generateId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe("normalizeEvent", () => {
  it("normalizes a complete event", () => {
    const result = normalizeEvent({
      id: "evt-1",
      traceId: "trace-1",
      type: "log",
      name: "test",
      timestamp: 1000,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("evt-1");
      expect(result.data.traceId).toBe("trace-1");
      expect(result.data.type).toBe("log");
      expect(result.data.timestamp).toBe(1000);
    }
  });

  it("generates id when not provided", () => {
    const result = normalizeEvent({
      traceId: "trace-2",
      type: "log",
      name: "auto-id",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBeDefined();
      expect(result.data.id).toHaveLength(36);
    }
  });

  it("generates timestamp when not provided", () => {
    const before = Date.now();
    const result = normalizeEvent({
      traceId: "trace-3",
      type: "log",
      name: "auto-ts",
    });
    const after = Date.now();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.data.timestamp).toBeLessThanOrEqual(after);
    }
  });

  it("rejects event with missing required fields", () => {
    const result = normalizeEvent({});
    expect(result.success).toBe(false);
  });

  it("rejects event with invalid type", () => {
    const result = normalizeEvent({
      traceId: "t1",
      type: "invalid",
      name: "x",
    });
    expect(result.success).toBe(false);
  });

  it("passes optional fields through", () => {
    const result = normalizeEvent({
      id: "evt-2",
      traceId: "trace-4",
      type: "error",
      name: "err-event",
      parentId: "parent-1",
      durationMs: 500,
      input: { key: "value" },
      output: "done",
      error: { name: "E", message: "msg" },
      metadata: { env: "test" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentId).toBe("parent-1");
      expect(result.data.durationMs).toBe(500);
      expect(result.data.input).toEqual({ key: "value" });
      expect(result.data.output).toBe("done");
      expect(result.data.error).toEqual({ name: "E", message: "msg" });
      expect(result.data.metadata).toEqual({ env: "test" });
    }
  });
});

describe("normalizeError", () => {
  it("converts Error instance", () => {
    const err = new TypeError("bad type");
    const result = normalizeError(err);
    expect(result.name).toBe("TypeError");
    expect(result.message).toBe("bad type");
    expect(result.stack).toBeDefined();
  });

  it("converts string", () => {
    const result = normalizeError("something went wrong");
    expect(result.name).toBe("Error");
    expect(result.message).toBe("something went wrong");
  });

  it("converts unknown value", () => {
    const result = normalizeError(42);
    expect(result.name).toBe("UnknownError");
    expect(result.message).toBe("42");
  });

  it("handles null", () => {
    const result = normalizeError(null);
    expect(result.message).toBe("null");
  });
});

describe("calculateDuration", () => {
  it("calculates positive duration", () => {
    expect(calculateDuration(1000, 2500)).toBe(1500);
  });

  it("returns undefined when startedAt is missing", () => {
    expect(calculateDuration(undefined, 1000)).toBeUndefined();
  });

  it("returns undefined when endedAt is missing", () => {
    expect(calculateDuration(1000, undefined)).toBeUndefined();
  });

  it("returns undefined when both are missing", () => {
    expect(calculateDuration(undefined, undefined)).toBeUndefined();
  });
});
