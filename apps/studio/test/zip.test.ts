import { describe, it, expect } from "vitest";
import { buildZip, jsonBytes } from "../src/lib/zip";

/**
 * Round-trip check: we emit STORE-method ZIP entries (no compression), so
 * reading them back is trivial — just check the local file headers parse
 * and the data matches what we wrote.
 */

function parseStoreZip(buf: Buffer): Array<{ name: string; data: Buffer }> {
  // Local file header layout (per PKWARE appnote):
  //   0..3   signature
  //   4..5   version needed
  //   6..7   general purpose flags
  //   8..9   compression method
  //  10..11  last mod time
  //  12..13  last mod date
  //  14..17  CRC-32 of uncompressed data
  //  18..21  compressed size
  //  22..25  uncompressed size
  //  26..27  file name length (n)
  //  28..29  extra field length
  //  30..    file name (n bytes) + extra + data
  const out: Array<{ name: string; data: Buffer }> = [];
  let off = 0;
  while (off + 4 <= buf.length) {
    const sig = buf.readUInt32LE(off);
    if (sig !== 0x04034b50) break;
    const nameLen = buf.readUInt16LE(off + 26);
    const dataLen = buf.readUInt32LE(off + 18);
    const headerLen = 30;
    const name = buf.subarray(off + headerLen, off + headerLen + nameLen).toString("utf-8");
    off += headerLen + nameLen;
    const data = buf.subarray(off, off + dataLen);
    off += dataLen;
    out.push({ name, data: Buffer.from(data) });
  }
  return out;
}

describe("buildZip", () => {
  it("produces a single-entry archive that round-trips", () => {
    const bytes = jsonBytes({ hello: "world" });
    const zip = buildZip([{ name: "manifest.json", data: bytes }]);

    const parsed = parseStoreZip(zip);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("manifest.json");
    expect(JSON.parse(parsed[0].data.toString("utf-8"))).toEqual({
      hello: "world",
    });
  });

  it("handles multiple entries in order", () => {
    const zip = buildZip([
      { name: "a.txt", data: Buffer.from("AAA") },
      { name: "b.txt", data: Buffer.from("BBBB") },
      { name: "c.txt", data: Buffer.from("CCCCC") },
    ]);
    const parsed = parseStoreZip(zip);
    expect(parsed.map((e) => e.name)).toEqual(["a.txt", "b.txt", "c.txt"]);
    expect(parsed.map((e) => e.data.toString("utf-8"))).toEqual([
      "AAA",
      "BBBB",
      "CCCCC",
    ]);
  });

  it("preserves UTF-8 in entry names", () => {
    const zip = buildZip([
      { name: "trazás/español.json", data: Buffer.from("{}", "utf-8") },
    ]);
    const parsed = parseStoreZip(zip);
    expect(parsed[0].name).toBe("trazás/español.json");
  });

  it("writes a valid end-of-central-directory record", () => {
    const zip = buildZip([
      { name: "x.json", data: jsonBytes({ a: 1 }) },
      { name: "y.json", data: jsonBytes({ a: 2 }) },
    ]);
    // The EOCD signature is 0x06054b50 ("PK\005\006"). Find it from the end.
    const lastFour = zip.subarray(zip.length - 22, zip.length - 18);
    expect(lastFour.readUInt32LE(0)).toBe(0x06054b50);
  });
});
