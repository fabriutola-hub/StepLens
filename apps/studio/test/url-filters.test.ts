import { describe, it, expect } from "vitest";
import {
  parseUrlState,
  stringifyUrlState,
  urlStateEquals,
} from "../src/lib/url-filters";

describe("parseUrlState", () => {
  it("returns empty state for empty params", () => {
    const state = parseUrlState(new URLSearchParams());
    expect(state.filters).toEqual({});
    expect(state.sort).toBeUndefined();
    expect(state.order).toBeUndefined();
    expect(state.page).toBeUndefined();
  });

  it("reads every filter", () => {
    const state = parseUrlState(
      new URLSearchParams(
        "q=search&status=error&from=100&to=200&model=gpt-4o&tool=web_search&hasError=1&favorite=true&tag=prod"
      )
    );
    expect(state.filters).toEqual({
      q: "search",
      status: "error",
      from: 100,
      to: 200,
      model: "gpt-4o",
      tool: "web_search",
      hasError: true,
      favorite: true,
      tag: "prod",
    });
  });

  it("rejects unknown status values silently", () => {
    const state = parseUrlState(new URLSearchParams("status=bogus"));
    expect(state.filters.status).toBeUndefined();
  });

  it("rejects non-numeric from/to", () => {
    const state = parseUrlState(new URLSearchParams("from=abc&to=xyz"));
    expect(state.filters.from).toBeUndefined();
    expect(state.filters.to).toBeUndefined();
  });

  it("accepts valid sort/order only", () => {
    const a = parseUrlState(new URLSearchParams("sort=durationMs&order=asc"));
    expect(a.sort).toBe("durationMs");
    expect(a.order).toBe("asc");

    const b = parseUrlState(new URLSearchParams("sort=bogus&order=sideways"));
    expect(b.sort).toBeUndefined();
    expect(b.order).toBeUndefined();
  });

  it("rejects negative page", () => {
    const state = parseUrlState(new URLSearchParams("page=-3"));
    expect(state.page).toBeUndefined();
  });
});

describe("stringifyUrlState", () => {
  it("omits defaults (empty filter, sort=startedAt, order=desc, page=0)", () => {
    const s = stringifyUrlState({ filters: {} });
    expect(s).toBe("");
  });

  it("emits only set fields", () => {
    const s = stringifyUrlState({
      filters: { q: "abc", status: "error" },
    });
    expect(s).toContain("q=abc");
    expect(s).toContain("status=error");
  });

  it("uses %20 not + for spaces (portable across curl/browser)", () => {
    const s = stringifyUrlState({ filters: { q: "hello world" } });
    expect(s).toContain("hello%20world");
    expect(s).not.toContain("+");
  });

  it("includes sort/order/page only when non-default", () => {
    const a = stringifyUrlState({ filters: {}, sort: "name" });
    expect(a).toContain("sort=name");
    expect(a).not.toContain("order=");
    expect(a).not.toContain("page=");

    const b = stringifyUrlState({ filters: {}, page: 3 });
    expect(b).toContain("page=3");
  });
});

describe("urlStateEquals", () => {
  it("returns true for equivalent states", () => {
    const a = { filters: { status: "error" }, sort: "name" as const };
    const b = { filters: { status: "error" }, sort: "name" as const };
    expect(urlStateEquals(a, b)).toBe(true);
  });

  it("returns false for different filter sets", () => {
    const a = { filters: { status: "error" } };
    const b = { filters: { status: "success" } };
    expect(urlStateEquals(a, b)).toBe(false);
  });
});
