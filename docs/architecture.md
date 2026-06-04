# Architecture

StepLens is a small monorepo. Everything is **local-first**: the SDK
records to a Studio instance on `localhost`, which stores data in a local SQLite
file. There is no cloud component and no authentication.

## Packages

```
@agent-replay/core      types · Zod schemas · cost lookup        (published)
        ▲
        │
@agent-replay/sdk       createClient · collectors · helpers      (published)
        ▲
        │
@agent-replay/cli       agent-replay command                     (published)
        │  (bundles examples)
@agent-replay/examples  demo agents                              (private)

@agent-replay/studio    Next.js UI + ingest/query API            (private)
```

- **core** — the shared vocabulary: `Trace`, `ReplaySpan`, `ModelCall`,
  `ToolCall`, `ReplayEvent`; Zod schemas (including the `batchIngest` schema the
  API validates against); and `calculateCost()` / pricing.
- **sdk** — `createClient`, the `Trace`/`Span` objects, `MemoryCollector` and
  `HttpCollector`, and the `withSpan`/`withModelCall`/`withToolCall` helpers.
- **cli** — `demo`, `record`, `export`, `dev`, `doctor`, `init`.
- **studio** — the Next.js app: React UI plus API routes under `/api`.

## Data flow

```
your agent ──(@agent-replay/sdk)──▶ HttpCollector
                                        │  batched POST
                                        ▼
                         http://localhost:3000/api/ingest
                                        │  Zod-validated, cost computed
                                        ▼
                              SQLite (~/.agent-replay/studio.db)
                                        ▲
                       /api/traces, /api/traces/[id], /api/export/[id]
                                        ▲
                                Studio UI (timeline · graph · inspector · replay)
```

1. The SDK buffers events and POSTs batches to `/api/ingest`.
2. The ingest route validates the batch with the core Zod schema, then
   `insertBatchEvents` writes rows. For model calls it **recomputes the cost
   server-side** from `(model, inputTokens, outputTokens)` so the stored value is
   authoritative.
3. The UI polls `/api/traces` (list + advanced filters, with per-trace cost
   aggregated via `SUM`) and `/api/traces/[id]` (full detail), and offers
   `/api/export/[id]`.
4. The Studio Workbench (0.65) also calls `/api/traces/stats` (filtered
   aggregates), `/api/traces/[id]/annotation` (local favorite/note/tags),
   `/api/views` (saved filter sets), and `/api/compare` (two-trace deltas).
   These are local Studio concerns — annotations and saved views never leave the
   machine and are not part of trace exports.

## Data model

Five tables, mirroring the core types one-to-one (JSON columns store structured
fields like `input`, `output`, `metadata`, `messages`, `attributes`, `error`):

- `traces` — one row per agent run (status, timing, input/output, metadata).
- `events` — point-in-time or short events (logs, errors, lifecycle).
- `spans` — timed, nestable operations (`parentId` forms the tree).
- `model_calls` — LLM calls with tokens and `estimated_cost_usd`.
- `tool_calls` — tool/function executions with input/output and status.

Two local-only tables (added in 0.65, never exported) hold Studio metadata:

- `trace_annotations` — per-trace `favorite`, `note`, and `tags`.
- `saved_views` — named, reusable workbench filter sets.

Children reference `trace_id` with `ON DELETE CASCADE`, so deleting a trace
removes everything under it (including its annotation).

## Storage

- Default path: `~/.agent-replay/studio.db` (created on first run).
- SQLite with **WAL** mode, foreign keys on. Drizzle ORM is used for queries;
  base tables are created via idempotent `CREATE TABLE IF NOT EXISTS` DDL in
  `apps/studio/src/db/connection.ts`. Additive changes ship as recorded,
  idempotent migrations tracked in a `schema_migrations` table, so existing
  databases upgrade in place without data loss.
- To reset: delete `studio.db` (and its `-wal` / `-shm` siblings).

## Costs

- Cost is **estimated** and always expressed in **USD decimal dollars** (e.g.
  `0.0075`) — never cents.
- `estimated_cost_usd` is a SQLite `REAL` column. The SDK estimates a cost
  locally, but the ingest route **recomputes and stores** it server-side, so the
  database is the source of truth. List, detail, graph, and inspector all read
  this same decimal value (no `/100` conversions).
- Pricing lives in a **static, hand-maintained** table in `@agent-replay/core`
  (`cost.ts`). It is a mid-2025 snapshot and will drift; unknown models yield no
  cost. The UI labels costs "Est.".

## Replay

"Replay" is **step-by-step playback of a recorded trace** — a playhead over the
timeline with play / pause / step / seek. It highlights the current event, dims
not-yet-reached ones, and drives the inspector. It does **not** re-execute the
agent or reproduce side effects.

## Conventions

- Single endpoint: SDK, CLI, and Studio all default to `http://localhost:3000`.
- Timestamps are epoch milliseconds; durations are milliseconds.
- IDs are UUIDs generated by the SDK.
