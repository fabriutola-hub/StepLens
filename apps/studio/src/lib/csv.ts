/**
 * CSV utilities — no extra dependencies.
 *
 * RFC 4180 quoting: wrap in double-quotes when the field contains a delimiter,
 * a quote, or any newline; double internal quotes. UTF-8 BOM is prepended so
 * Excel on Windows renders accented characters correctly.
 */

const BOM = "﻿";

function escape(value: unknown): string {
  if (value == null) return "";
  const s = typeof value === "string" ? value : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

/** Serialize an array of rows into a CSV string. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map((c) => escape(c.header)).join(",");
  const dataLines = rows.map((row) =>
    columns.map((c) => escape(c.value(row))).join(",")
  );
  return BOM + [headerLine, ...dataLines].join("\r\n");
}

/** Trigger a browser download for the given CSV text. */
export function downloadCsv(text: string, filename: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Chrome has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
