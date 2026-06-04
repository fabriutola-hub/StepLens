import { describe, it, expect } from "vitest";
import { messageOf, internalError } from "../src/lib/http-errors";

describe("messageOf", () => {
  it("returns the message of an Error", () => {
    expect(messageOf(new Error("boom"))).toBe("boom");
    expect(messageOf(new TypeError("bad type"))).toBe("bad type");
  });

  it("returns the string itself when given a string", () => {
    expect(messageOf("plain string")).toBe("plain string");
  });

  it("JSON-stringifies arbitrary objects", () => {
    expect(messageOf({ code: 42, info: "x" })).toBe('{"code":42,"info":"x"}');
  });

  it("falls back to 'Unknown error' for unserializable inputs", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(messageOf(cyclic)).toBe("Unknown error");
  });

  it("handles null and undefined", () => {
    expect(messageOf(null)).toBe("null");
    expect(messageOf(undefined)).toBe("undefined");
  });
});

describe("internalError", () => {
  it("returns a 500 by default with the standard JSON envelope", async () => {
    const res = internalError(new Error("boom"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: "Internal server error",
      details: "boom",
    });
  });

  it("honors a custom status code", async () => {
    const res = internalError("not authorized", 401);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.details).toBe("not authorized");
  });
});
