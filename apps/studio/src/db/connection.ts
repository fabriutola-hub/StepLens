/**
 * Database connection utilities for StepLens.
 *
 * Opens (or creates) a local SQLite database and returns a Drizzle instance.
 * Tables are auto-created on first connection via raw DDL.
 */
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { resolve } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import * as schema from "./schema";

// ── Types ───────────────────────────────────────────────────────────────────

export interface DatabaseOptions {
  /**
   * Path to the SQLite file. Defaults to `~/.agent-replay/studio.db`.
   */
  path?: string;
  /**
   * If `true` (default), automatically creates tables on first connection.
   */
  migrate?: boolean;
  /**
   * If `true` (default), enables WAL mode for better concurrent read perf.
   */
  wal?: boolean;
}

export type DatabaseSchema = typeof schema;

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_DIR = resolve(homedir(), ".agent-replay");
const DEFAULT_DB = resolve(DEFAULT_DIR, "studio.db");

// ── DDL ─────────────────────────────────────────────────────────────────────

const INIT_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "traces" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "status" text NOT NULL DEFAULT 'running',
    "started_at" integer NOT NULL,
    "ended_at" integer,
    "duration_ms" integer,
    "input" text,
    "output" text,
    "metadata" text
  )`,
  `CREATE TABLE IF NOT EXISTS "events" (
    "id" text PRIMARY KEY NOT NULL,
    "trace_id" text NOT NULL REFERENCES "traces"("id") ON DELETE CASCADE,
    "parent_id" text,
    "type" text NOT NULL,
    "name" text NOT NULL,
    "timestamp" integer NOT NULL,
    "duration_ms" integer,
    "input" text,
    "output" text,
    "error" text,
    "metadata" text
  )`,
  `CREATE TABLE IF NOT EXISTS "spans" (
    "id" text PRIMARY KEY NOT NULL,
    "trace_id" text NOT NULL REFERENCES "traces"("id") ON DELETE CASCADE,
    "parent_id" text,
    "name" text NOT NULL,
    "kind" text NOT NULL DEFAULT 'custom',
    "status" text NOT NULL DEFAULT 'running',
    "started_at" integer NOT NULL,
    "ended_at" integer,
    "duration_ms" integer,
    "attributes" text
  )`,
  `CREATE TABLE IF NOT EXISTS "model_calls" (
    "id" text PRIMARY KEY NOT NULL,
    "trace_id" text NOT NULL REFERENCES "traces"("id") ON DELETE CASCADE,
    "span_id" text REFERENCES "spans"("id") ON DELETE SET NULL,
    "provider" text NOT NULL,
    "model" text NOT NULL,
    "prompt" text,
    "messages" text,
    "response" text,
    "input_tokens" integer,
    "output_tokens" integer,
    "total_tokens" integer,
    "estimated_cost_usd" real,
    "started_at" integer NOT NULL,
    "ended_at" integer,
    "duration_ms" integer,
    "metadata" text
  )`,
  `CREATE TABLE IF NOT EXISTS "tool_calls" (
    "id" text PRIMARY KEY NOT NULL,
    "trace_id" text NOT NULL REFERENCES "traces"("id") ON DELETE CASCADE,
    "span_id" text REFERENCES "spans"("id") ON DELETE SET NULL,
    "tool_name" text NOT NULL,
    "input" text,
    "output" text,
    "status" text NOT NULL DEFAULT 'running',
    "started_at" integer NOT NULL,
    "ended_at" integer,
    "duration_ms" integer,
    "error" text,
    "metadata" text
  )`,

  `CREATE INDEX IF NOT EXISTS "traces_started_at_idx" ON "traces"("started_at")`,
  `CREATE INDEX IF NOT EXISTS "traces_status_idx" ON "traces"("status")`,
  `CREATE INDEX IF NOT EXISTS "traces_name_idx" ON "traces"("name")`,
  `CREATE INDEX IF NOT EXISTS "events_trace_id_idx" ON "events"("trace_id")`,
  `CREATE INDEX IF NOT EXISTS "events_timestamp_idx" ON "events"("timestamp")`,
  `CREATE INDEX IF NOT EXISTS "events_type_idx" ON "events"("type")`,
  `CREATE INDEX IF NOT EXISTS "events_trace_timestamp_idx" ON "events"("trace_id","timestamp")`,
  `CREATE INDEX IF NOT EXISTS "spans_trace_id_idx" ON "spans"("trace_id")`,
  `CREATE INDEX IF NOT EXISTS "spans_parent_id_idx" ON "spans"("parent_id")`,
  `CREATE INDEX IF NOT EXISTS "spans_started_at_idx" ON "spans"("started_at")`,
  `CREATE INDEX IF NOT EXISTS "spans_trace_started_idx" ON "spans"("trace_id","started_at")`,
  `CREATE INDEX IF NOT EXISTS "model_calls_trace_id_idx" ON "model_calls"("trace_id")`,
  `CREATE INDEX IF NOT EXISTS "model_calls_span_id_idx" ON "model_calls"("span_id")`,
  `CREATE INDEX IF NOT EXISTS "model_calls_started_at_idx" ON "model_calls"("started_at")`,
  `CREATE INDEX IF NOT EXISTS "model_calls_model_idx" ON "model_calls"("model")`,
  `CREATE INDEX IF NOT EXISTS "tool_calls_trace_id_idx" ON "tool_calls"("trace_id")`,
  `CREATE INDEX IF NOT EXISTS "tool_calls_span_id_idx" ON "tool_calls"("span_id")`,
  `CREATE INDEX IF NOT EXISTS "tool_calls_started_at_idx" ON "tool_calls"("started_at")`,
  `CREATE INDEX IF NOT EXISTS "tool_calls_tool_name_idx" ON "tool_calls"("tool_name")`,
];

// ── Migrations ────────────────────────────────────────────────────────────────
//
// Additive, idempotent migrations layered on top of the base tables above. Each
// migration is recorded once in `schema_migrations`; re-running is a no-op. This
// lets a `0.4.0`-era database (the five base tables, no `schema_migrations`)
// upgrade in place without data loss and without destructive resets.
//
// Rules:
//   - Migrations only ADD tables/columns/indexes; never drop or rewrite data.
//   - Statements stay idempotent (`IF NOT EXISTS`) so a half-applied or
//     manually-created schema still converges cleanly.

interface Migration {
  id: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    // 0.65.0 — local Studio metadata: per-trace annotations and saved views.
    id: "0001_studio_metadata",
    statements: [
      `CREATE TABLE IF NOT EXISTS "trace_annotations" (
        "trace_id" text PRIMARY KEY NOT NULL REFERENCES "traces"("id") ON DELETE CASCADE,
        "favorite" integer NOT NULL DEFAULT 0,
        "note" text,
        "tags" text,
        "updated_at" integer NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS "trace_annotations_favorite_idx" ON "trace_annotations"("favorite")`,
      `CREATE TABLE IF NOT EXISTS "saved_views" (
        "id" text PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "filters_json" text,
        "created_at" integer NOT NULL,
        "updated_at" integer NOT NULL
      )`,
    ],
  },
];

/**
 * Bring a raw SQLite database up to the current schema.
 *
 * Idempotent: creates the base tables (if missing), ensures the
 * `schema_migrations` ledger exists, then applies any migrations not yet
 * recorded. Safe to call on an empty DB, a `0.4.0`-style DB, or an
 * already-current DB. Exported so tests can drive it against their own
 * connections without touching the process-wide singleton.
 */
export function applyMigrations(sqlite: Database.Database): void {
  // Base tables — unchanged since 0.4.0, created with IF NOT EXISTS.
  for (const stmt of INIT_DDL) {
    sqlite.exec(stmt);
  }

  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS "schema_migrations" (
      "id" text PRIMARY KEY NOT NULL,
      "applied_at" integer NOT NULL
    )`
  );

  const applied = new Set(
    sqlite
      .prepare(`SELECT id FROM "schema_migrations"`)
      .all()
      .map((row) => (row as { id: string }).id)
  );

  const record = sqlite.prepare(
    `INSERT INTO "schema_migrations" ("id", "applied_at") VALUES (?, ?)`
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    const run = sqlite.transaction(() => {
      for (const stmt of migration.statements) {
        sqlite.exec(stmt);
      }
      record.run(migration.id, Date.now());
    });
    run();
  }
}

// ── Connection ──────────────────────────────────────────────────────────────

declare global {
  // Single process-wide Drizzle handle. `var` here is intentional: Node's
  // `globalThis` only sees `var`-declared module bindings, and Next.js HMR
  // recreates module instances per request — without this, every refresh
  // would re-open SQLite and ignore WAL.
  var __db: BetterSQLite3Database<DatabaseSchema> | undefined;
}

/**
 * Open a connection to the StepLens database.
 */
export function getDatabase(
  options: DatabaseOptions = {}
): BetterSQLite3Database<DatabaseSchema> {
  if (globalThis.__db) {
    return globalThis.__db;
  }

  const dbPath = options.path ?? DEFAULT_DB;
  const shouldMigrate = options.migrate ?? true;
  const shouldWal = options.wal ?? true;

  const dir = resolve(dbPath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);

  if (shouldWal) {
    sqlite.pragma("journal_mode = WAL");
  }
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("cache_size = -64000");
  sqlite.pragma("temp_store = MEMORY");
  sqlite.pragma("busy_timeout = 10000");

  const db = drizzle(sqlite, { schema });

  if (shouldMigrate) {
    applyMigrations(sqlite);
  }

  globalThis.__db = db;
  return db;
}

export function getDefaultDbPath(): string {
  return DEFAULT_DB;
}