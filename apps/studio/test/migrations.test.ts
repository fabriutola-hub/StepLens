import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMigrations, MIGRATIONS } from "../src/db/connection";

// The five tables a 0.4.0 database shipped with — no schema_migrations ledger,
// no annotation/saved-view tables.
const LEGACY_DDL = `
  CREATE TABLE traces (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running',
    started_at INTEGER NOT NULL, ended_at INTEGER, duration_ms INTEGER,
    input TEXT, output TEXT, metadata TEXT
  );
  CREATE TABLE events (
    id TEXT PRIMARY KEY, trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
    parent_id TEXT, type TEXT NOT NULL, name TEXT NOT NULL,
    timestamp INTEGER NOT NULL, duration_ms INTEGER, input TEXT, output TEXT, error TEXT, metadata TEXT
  );
  CREATE TABLE spans (
    id TEXT PRIMARY KEY, trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
    parent_id TEXT, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'custom',
    status TEXT NOT NULL DEFAULT 'running',
    started_at INTEGER NOT NULL, ended_at INTEGER, duration_ms INTEGER, attributes TEXT
  );
  CREATE TABLE model_calls (
    id TEXT PRIMARY KEY, trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
    span_id TEXT REFERENCES spans(id) ON DELETE SET NULL,
    provider TEXT NOT NULL, model TEXT NOT NULL, prompt TEXT, messages TEXT, response TEXT,
    input_tokens INTEGER, output_tokens INTEGER, total_tokens INTEGER,
    estimated_cost_usd REAL, started_at INTEGER NOT NULL, ended_at INTEGER, duration_ms INTEGER, metadata TEXT
  );
  CREATE TABLE tool_calls (
    id TEXT PRIMARY KEY, trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
    span_id TEXT REFERENCES spans(id) ON DELETE SET NULL,
    tool_name TEXT NOT NULL, input TEXT, output TEXT, status TEXT NOT NULL DEFAULT 'running',
    started_at INTEGER NOT NULL, ended_at INTEGER, duration_ms INTEGER, error TEXT, metadata TEXT
  );
`;

function tableExists(sqlite: Database.Database, name: string): boolean {
  const row = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(name) as { name: string } | undefined;
  return Boolean(row);
}

function appliedMigrations(sqlite: Database.Database): string[] {
  return (
    sqlite.prepare(`SELECT id FROM schema_migrations`).all() as { id: string }[]
  ).map((r) => r.id);
}

describe("schema migrations", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function makeDbPath(): string {
    dir = mkdtempSync(join(tmpdir(), "steplens-mig-"));
    return join(dir, "studio.db");
  }

  it("migrates a 0.4.0-style DB once, then reopens idempotently without data loss", () => {
    const dbPath = makeDbPath();

    // ── 1. Simulate a 0.4.0 database: base tables + data, no migration ledger.
    {
      const sqlite = new Database(dbPath);
      sqlite.exec(LEGACY_DDL);
      sqlite
        .prepare(
          `INSERT INTO traces (id, name, status, started_at, duration_ms) VALUES (?, ?, ?, ?, ?)`
        )
        .run("legacy-1", "Legacy Agent", "success", 1000, 100);
      expect(tableExists(sqlite, "schema_migrations")).toBe(false);
      expect(tableExists(sqlite, "trace_annotations")).toBe(false);
      expect(tableExists(sqlite, "saved_views")).toBe(false);
      sqlite.close();
    }

    // ── 2. Open and migrate.
    {
      const sqlite = new Database(dbPath);
      applyMigrations(sqlite);
      expect(tableExists(sqlite, "schema_migrations")).toBe(true);
      expect(tableExists(sqlite, "trace_annotations")).toBe(true);
      expect(tableExists(sqlite, "saved_views")).toBe(true);
      expect(appliedMigrations(sqlite)).toContain("0001_studio_metadata");

      // Existing data survived.
      const trace = sqlite
        .prepare(`SELECT name FROM traces WHERE id = ?`)
        .get("legacy-1") as { name: string };
      expect(trace.name).toBe("Legacy Agent");

      // The new table is usable.
      sqlite
        .prepare(
          `INSERT INTO trace_annotations (trace_id, favorite, tags, updated_at) VALUES (?, ?, ?, ?)`
        )
        .run("legacy-1", 1, JSON.stringify(["kept"]), 1);
      sqlite.close();
    }

    // ── 3. Reopen and migrate again: idempotent, no duplicate, data intact.
    {
      const sqlite = new Database(dbPath);
      applyMigrations(sqlite);
      const count = (
        sqlite
          .prepare(
            `SELECT COUNT(*) AS c FROM schema_migrations WHERE id = '0001_studio_metadata'`
          )
          .get() as { c: number }
      ).c;
      expect(count).toBe(1);

      const trace = sqlite
        .prepare(`SELECT name FROM traces WHERE id = ?`)
        .get("legacy-1") as { name: string };
      expect(trace.name).toBe("Legacy Agent");

      const anno = sqlite
        .prepare(`SELECT tags FROM trace_annotations WHERE trace_id = ?`)
        .get("legacy-1") as { tags: string };
      expect(JSON.parse(anno.tags)).toEqual(["kept"]);
      sqlite.close();
    }
  });

  it("applies every defined migration on a fresh database", () => {
    const dbPath = makeDbPath();
    const sqlite = new Database(dbPath);
    applyMigrations(sqlite);
    const applied = appliedMigrations(sqlite);
    for (const migration of MIGRATIONS) {
      expect(applied).toContain(migration.id);
    }
    // Base tables exist too.
    expect(tableExists(sqlite, "traces")).toBe(true);
    sqlite.close();
  });
});
