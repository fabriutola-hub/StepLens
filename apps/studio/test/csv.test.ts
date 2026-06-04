import { describe, it, expect } from "vitest";
import { toCsv, downloadCsv } from "../src/lib/csv";

describe("CSV serializer", () => {
  it("returns header-only when given no rows", () => {
    const csv = toCsv<{ a: string }>([], [
      { header: "a", value: (r) => r.a },
    ]);
    // BOM + "a" with CRLF inside the value.
    expect(csv).toBe("﻿a");
  });

  it("joins multiple rows with CRLF", () => {
    const csv = toCsv(
      [{ a: 1, b: 2 }, { a: 3, b: 4 }],
      [
        { header: "a", value: (r) => r.a },
        { header: "b", value: (r) => r.b },
      ]
    );
    expect(csv).toBe("﻿a,b\r\n1,2\r\n3,4");
  });

  it("escapes commas, double-quotes, and newlines per RFC 4180", () => {
    const csv = toCsv(
      [
        { name: 'has, comma', note: 'has "quote"' },
        { name: 'has\nnewline', note: "ok" },
      ],
      [
        { header: "name", value: (r) => r.name },
        { header: "note", value: (r) => r.note },
      ]
    );
    expect(csv).toBe(
      '﻿name,note\r\n"has, comma","has ""quote"""\r\n"has\nnewline",ok'
    );
  });

  it("treats null/undefined as empty cells", () => {
    const csv = toCsv(
      [{ a: null, b: undefined }],
      [
        { header: "a", value: (r) => r.a },
        { header: "b", value: (r) => r.b },
      ]
    );
    expect(csv).toBe("﻿a,b\r\n,");
  });

  it("stringifies numbers and booleans without quoting them", () => {
    const csv = toCsv(
      [{ count: 42, ok: true }],
      [
        { header: "count", value: (r) => r.count },
        { header: "ok", value: (r) => r.ok },
      ]
    );
    expect(csv).toBe("﻿count,ok\r\n42,true");
  });
});

describe("downloadCsv", () => {
  it("no-ops in non-browser environments", () => {
    // Smoke: this test runs in jsdom, but if `window` is missing it should
    // simply return — never throw.
    expect(() => downloadCsv("a,b\r\n1,2", "f.csv")).not.toThrow();
  });
});
