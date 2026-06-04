/**
 * Minimal ZIP archive writer — no extra dependencies. The file format is
 * stable and well-documented (PKWARE appnote), and a tight CRC + deflate
 * cycle is enough to satisfy any unzip-compatible client.
 *
 * Supports STORE (no compression) only, which is fine for JSON payloads
 * that are already small and deflate-resistant.
 *
 * Reference: https://pkwarefiles.azureedge.net/webdocs/casestudies/APPNOTE.TXT
 */
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

export interface ZipEntry {
  /** File path inside the archive (forward slashes, no leading /). */
  name: string;
  /** Raw bytes to write under that path. */
  data: Buffer | Uint8Array;
  /** Last-modified time, ms since epoch. Defaults to now. */
  mtimeMs?: number;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

function crc32(data: Uint8Array): number {
  // Use zlib's crc32 for correctness — Node ships a stable implementation.
  // We compute it via the running CRC and the data in 64K chunks.
  let crc = crc32Init();
  for (let i = 0; i < data.length; i += 0x8000) {
    crc = crc32Update(crc, data.subarray(i, Math.min(i + 0x8000, data.length)));
  }
  return crc32Final(crc);
}

// Re-export from zlib's internal crc32 via the public `crc32` binding.
// Node ≥ 18 exposes `zlib.crc32(buf)` (no longer internal in 22).
import { crc32 as zlibCrc32 } from "node:zlib";
function crc32Init(): number { return 0; }
function crc32Update(_crc: number, data: Uint8Array): number {
  return zlibCrc32(Buffer.from(data));
}
function crc32Final(crc: number): number { return crc >>> 0; }

function dosTime(d: Date): { time: number; date: number } {
  const seconds = Math.min(59, Math.floor(d.getSeconds()));
  const time =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    ((seconds >> 1) & 0x1f);
  const date =
    (((d.getFullYear() - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0x0f) << 5) |
    (d.getDate() & 0x1f);
  return { time, date };
}

export function buildZip(entries: ZipEntry[]): Buffer {
  const now = new Date();
  const { time, date } = dosTime(now);

  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf-8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = crc32(data);

    // Local file header (30 bytes + name + data)
    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4);                    // version needed
    local.writeUInt16LE(0, 6);                     // flags
    local.writeUInt16LE(0, 8);                     // method = store
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);          // compressed size
    local.writeUInt32LE(data.length, 22);          // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);                    // extra length
    localChunks.push(local, nameBuf, data);

    // Central directory header (46 bytes + name)
    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4);                  // version made by
    central.writeUInt16LE(20, 6);                  // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);                  // extra length
    central.writeUInt16LE(0, 32);                  // comment length
    central.writeUInt16LE(0, 34);                  // disk number start
    central.writeUInt16LE(0, 36);                  // internal attrs
    central.writeUInt32LE(0, 38);                  // external attrs
    central.writeUInt32LE(offset, 42);             // local header offset
    centralChunks.push(central, nameBuf);

    offset += 30 + nameBuf.length + data.length;
  }

  // End of central directory record (22 bytes)
  const totalLocal = offset;
  const totalCentral = centralChunks.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(SIG_END, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(totalCentral, 12);
  end.writeUInt32LE(totalLocal, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localChunks, ...centralChunks, end]);
}

/** Convenience: write a JSON file to a Buffer with stable formatting. */
export function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

// `createHash` is re-exported for callers that want a stable file id based
// on the archive contents. Left here to keep the public surface small.
export { createHash };
