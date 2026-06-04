# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and the project aims
to follow [Semantic Versioning](https://semver.org/).

## [0.66.0] — 2026-06-04

Studio Polish release. The Workbench grows the rough edges off: every common
action is one keystroke away, the UI now ships proper light/dark themes,
destructive actions confirm before firing, and CSV export lets you take a
filtered slice anywhere. Under the hood the Studio source tree is now
**lint-clean** under Next 16 / React 19 strict rules — zero warnings, zero
`any`s in route handlers, no setState-in-effect anywhere. SDK ingest/export
stays compatible; still no cloud, accounts, auth, or production-monitoring
scope.

### Added
- **Keyboard shortcuts**, page-aware and self-documenting. Press `?` anywhere
  to see what the current page exposes. Workbench: `/` focus search, `e`
  export CSV, `r` reload, `c` clear filters. Trace detail: `b` back, `s` / `t`
  / `g` / `v` / `d` for the Summary / Timeline / Graph / Events / Data tabs,
  `f` toggle favorite. Shortcuts are suppressed inside text fields except `/`.
- **Dark mode toggle** — three-way switch (`light` | `dark` | `system`) in the
  top nav, persisted to `localStorage`. An inline init script applies the
  correct class before first paint so there's no FOUC on reload. The
  `system` mode tracks `prefers-color-scheme` live.
- **Health endpoint** — `GET /api/health` returns `{ status, service, version,
  uptimeMs, startedAt, db: { connected, traceCount?, error? } }`. Returns
  `200` when SQLite is reachable, `503` otherwise. Suitable for Docker
  `HEALTHCHECK`, Kubernetes readiness probes, and uptime monitors. Always
  `Cache-Control: no-store`.
- **CSV export** of the filtered Workbench list — `Download CSV` button in
  the header or the `e` shortcut. Pulls the full filtered population (not
  just the current page), RFC 4180-quoted, UTF-8 with BOM so Excel renders
  accented characters correctly. Columns: id, name, status, startedAt,
  endedAt, durationMs, estimatedCostUsd, tags, favorite, note.
- **Toast notifications** — a tiny built-in, no extra dependencies. Used for
  delete success/failure and CSV export feedback. Top-right stack, auto-
  dismiss after 3.5s (5s for errors), `aria-live` polite for screen readers.
- **Confirm-before-delete** dialog — deleting a trace now opens a destructive-
  variant confirm with the trace name, so an accidental click on the row's
  trash icon no longer wipes data silently. `Enter` confirms, `Esc` cancels.
- **GitHub link** in the top nav for quick discovery.

### Changed
- **Studio is now lint-clean.** 27 errors and 2 warnings under `pnpm lint`
  before this release, all resolved: no `any` in any route handler (a shared
  `internalError(err)` helper replaces the per-handler boilerplate), no
  `setState`-inside-effect anywhere (effects either schedule via
  `queueMicrotask`, read external state via `useSyncExternalStore`, or let the
  caller remount via `key`), no `Date.now()` during render (the detail page
  now derives `traceEnd` from recorded event/span timestamps), and the
  `EmptyState`'s `window.location.origin` lookup moved to
  `useSyncExternalStore`. The Studio span tree in `queries.getTrace` is now
  typed end-to-end (no more `any` span nodes).
- `Input` is now a `forwardRef` so callers can focus it programmatically (used
  by the `/` shortcut).
- `SDK_VERSION`, `CORE_VERSION`, `CLI_VERSION`, and every package report
  `0.66.0`. Package names stay `@agent-replay/*`; the `steplens` /
  `agent-replay` binaries are unchanged.
- The bundled SDK snippet in `EmptyState` now references `npx steplens demo`
  (matching the published binary name).

### Fixed
- Compare view no longer logs a React-19 setState-in-effect warning when the
  page is opened directly with `?left=…&right=…`.
- `AnnotationPanel` no longer cascades a re-render when navigating between
  traces — it now remounts via `key={traceId}` from the caller, which is the
  React 19-recommended pattern for resetting derived state.

## [0.65.0] — 2026-06-04

Studio Workbench release. A local-first product-quality upgrade focused on
finding, comparing, and understanding traces faster. SDK ingest/export stays
compatible; still no cloud, accounts, auth, or production-monitoring scope.

### Added
- **Additive SQLite migrations** — Studio now tracks applied migrations in a
  `schema_migrations` table and upgrades a `0.4.0`-era database in place,
  idempotently and without data loss (no destructive resets).
- **Local Studio metadata** — new `trace_annotations` (favorite, note, tags)
  and `saved_views` tables. Annotations are machine-local and are **not** part
  of recorded traces or exports.
- **Advanced trace search & filtering** — `/api/traces` gained `q`, `status`,
  `from`, `to`, `model`, `tool`, `hasError`, `favorite`, `tag`, `sort`,
  `order`, `limit`, and `offset`.
- **Filtered stats** — `GET /api/traces/stats` returns count, status counts,
  total/avg/p95 duration, total tokens, estimated cost, model/tool counts, and
  error rate over the filtered population.
- **Annotations API** — `GET`/`PUT /api/traces/:id/annotation` for local
  favorite/note/tags updates.
- **Saved views API** — `GET`/`POST /api/views` and `PUT`/`DELETE
  /api/views/:id`.
- **Trace comparison** — `GET /api/compare?left=&right=` returns both traces
  plus deltas for duration, cost, tokens, errors, models, tools, and matched
  spans by `kind:name`, with a `/compare` view of delta cards, side-by-side
  metadata, and breakdowns.
- **Studio Workbench UI** — replaces the simple list with a dense workbench:
  search, facet filters, sortable table, stats strip, favorite/tag indicators,
  saved views, compare selection, and clear empty/loading/error states. Polling
  pauses while editing filters.
- **Trace detail** — new Summary tab with hotspots (slowest spans / model calls
  / tools, errors, totals, and a critical shortlist); clicking a hotspot selects
  the same item in the timeline/inspector. Timeline gained category/status
  filtering and in-trace search. Detail and list gained a favorite toggle, tag
  editor, and a local note panel.

### Changed
- The two duplicate Studio API clients were unified into one typed client built
  on a shared `trace-types` contract, so list/detail/stats/annotations/views/
  compare share the same shapes.
- The timeline now includes nested child spans (previously root-only), so
  hotspot selection resolves any span.
- `SDK_VERSION`, `CORE_VERSION`, and the CLI version now report `0.65.0`; all
  packages bumped to `0.65.0` (package names stay `@agent-replay/*` and the
  `steplens`/`agent-replay` binaries are unchanged).

### Notes
- Trace export remains trace data only; local notes/tags/favorites are Studio
  metadata and are not exported.
- Existing `~/.agent-replay/studio.db` files upgrade automatically on first open.

## [0.3.0] — 2026-06-03

Integrations release. StepLens now works with real LLM stacks — Vercel AI SDK,
LangChain/LangGraph, Anthropic, and Google Gemini — with a minimal
wrapper/callback and no manual instrumentation. Still local-first: no cloud, no
accounts, no DB migration, and fully compatible with the `0.2` API.

### Added
- **Vercel AI SDK integration** — `@agent-replay/sdk/integrations/vercel-ai`'s
  `wrapAISDK({ generateText, streamText, generateObject?, streamObject? })`:
  records `generateText`/`generateObject` on resolution and
  `streamText`/`streamObject` via `onFinish`/`onError` (your callbacks are
  preserved). Multi-step calls record one model call per step plus the step's
  tool calls. Provider/model extracted from gateway strings
  (`"openai/gpt-4o-mini"`) or language-model objects (`provider`/`modelId`).
- **Anthropic integration** — `@agent-replay/sdk/integrations/anthropic`'s
  `wrapAnthropic(client)`: records `messages.create` (tokens from `usage`,
  text content, and `stop_reason`/`id`/cache-token metadata) and
  `messages.stream(...)` by wrapping `finalMessage()` — streaming is recorded
  only when you call/await `finalMessage()`.
- **Google Gemini integration** — `@agent-replay/sdk/integrations/google`'s
  `wrapGoogleGenAI(client)`: records `models.generateContent` and
  `models.generateContentStream` (transparent async iterable; text accumulates
  per chunk, last `usageMetadata` wins). Extracts `promptTokenCount`,
  `candidatesTokenCount`, `totalTokenCount`, `modelVersion`, and `responseId`.
- **LangChain / LangGraph integration** —
  `@agent-replay/sdk/integrations/langchain`'s
  `createLangChainCallbackHandler(options?)`: chains/agents → spans,
  retrievers → `retrieval` spans, tools → spans + tool calls, LLM/chat models →
  spans + model calls. Preserves the `runId`/`parentRunId` hierarchy, records
  `handle*Error` failures, and reads tokens from `llmOutput.tokenUsage`,
  `usage_metadata`, `response_metadata.tokenUsage`, or equivalents. Works
  inside `replay.record()` or opens its own trace with `{ replay, traceName }`.
- **OpenAI streaming** — `wrapOpenAI` now supports `{ stream: true }` on
  `chat.completions.create` and `responses.create`: the stream is returned
  untouched and the model call is recorded only once it is consumed to
  completion (never auto-drained; abandoning a stream records nothing).
- **Optional timestamps on `Trace.recordModelCall`** — `startedAt`, `endedAt`,
  and `durationMs` (backward compatible; `durationMs` is derived when omitted).
  No schema/DB change — the fields already existed in core and ingest.
- **CLI templates** — `agent-replay new vercel-ai|anthropic|google|langchain`,
  each stating the required package, the required API key, and a clear
  real-cost warning. `simple`, `error`, `openai`, and `ollama` are unchanged.
- Unit tests for every integration using fake structural clients (no provider
  SDKs installed), plus CLI template tests.

### Changed
- README gained an integration matrix; `docs/sdk.md` documents every
  integration; `docs/cli.md` lists the new templates.
- `SDK_VERSION` and `CORE_VERSION` now track the package version (`0.3.0`).
- All packages bumped to `0.3.0` (package names stay `@agent-replay/*` for
  compatibility).

### Notes
- Integrations use **structural types only** — `openai`, `ai`,
  `@anthropic-ai/sdk`, `@google/genai`, `langchain`, and `@langchain/*` are
  **not** runtime dependencies of the SDK. Calls outside `record()` pass
  through untouched.
- Streams are recorded on completion, not at start, and are never consumed
  automatically.
- Costs remain estimates from the static pricing table; unknown models show
  tokens without a cost.
- No SQLite migration.

## [0.2.0] — 2026-06-03

Developer-experience release. Easier to try, instrument, and share — without
breaking the `0.1.0` API.

### Added
- **Simple SDK API** — `@agent-replay/sdk/simple`: `createReplay` / `replay`,
  `record(name, fn)` (auto trace + flush), and a `run` scope with `step`,
  `tool`, `model("provider:model", …)`, and `log`. Also re-exported from
  `@agent-replay/sdk` for discovery.
- **OpenAI integration** — `@agent-replay/sdk/integrations/openai`'s
  `wrapOpenAI(client, { replay })` records `chat.completions.create` and
  `responses.create` inside a `record()` run, with no dependency on `openai`.
- **CLI `new`** — `agent-replay new simple|error|openai|ollama` scaffolds a
  runnable `.mjs` example (`--out`, `--endpoint`, `--force`).
- **CLI `import`** — `agent-replay import <file> [--replace]` uploads a trace
  JSON to Studio.
- **Import / delete API** — `POST /api/import` (+ `?replace=true`, `409` on
  conflict, flattens span trees, preserves `trace.id`) and
  `DELETE /api/traces/:traceId` (cascades to children).
- **Distribution & docs** — a `Dockerfile` (Next.js standalone) for running
  Studio outside the monorepo, `docs/comparison.md`, `ROADMAP.md`,
  `.github/labels.yml`, and screenshots in the README.
- Tests for the simple API, the OpenAI wrapper, the `new`/`import` CLI commands,
  and import/export/delete round-trips.

### Changed
- `SDK_VERSION` and `CORE_VERSION` now track the package version (`0.2.0`).
- Studio builds in `output: "standalone"` mode (for Docker).
- All packages bumped to `0.2.0`.

### Notes
- The `0.1.0` SDK API (`createClient`, `Trace`, `Span`, `withSpan`, …) is
  unchanged and fully supported.
- Still local-first: no accounts, auth, or cloud.

## [0.1.0] — 2026-06-03

First public, open-source-ready release. The goal of this release was a
reliable local-first MVP that a newcomer can clone, run, and trust.

### Added
- `README.md`, `docs/quickstart.md`, `docs/sdk.md`, `docs/cli.md`, and
  `docs/architecture.md`.
- `createClient({ endpoint })` as the primary SDK entry point, plus support for
  the `AGENT_REPLAY_ENDPOINT` and `AGENT_REPLAY_ENABLED` environment variables.
- `client.shutdown()` / `client.flush()` helpers that delegate to the collector.
- `agent-replay init` now scaffolds a real `.env` the SDK reads.
- Step-by-step **replay** controls wired into the Studio timeline (play, step,
  seek), with the inspector following the playhead.
- Export button on the trace detail page.
- API/route tests (ingest, list, detail, export), SDK `createClient` tests
  (defaults, env vars, shutdown, `http.baseUrl` compatibility), real CLI
  execution tests, and cost format/aggregation tests.
- `typecheck` scripts for every package; CI workflow (install, typecheck, test,
  build); `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, and issue/PR templates.

### Changed
- **Single endpoint:** the SDK, CLI, and Studio all default to
  `http://localhost:3000` (previously the SDK/CLI defaulted to `3456`).
- **Costs are USD decimal dollars** everywhere. `estimated_cost_usd` is now a
  SQLite `REAL` column, and the Studio graph and inspector no longer divide by
  100 — list, detail, graph, and inspector now agree. Estimates are labeled
  "Est." in the UI.
- The CLI `record` command is described honestly as "run a command with Agent
  Replay env vars set" — it does not auto-instrument.
- The Studio empty state now shows the active ingest endpoint, the demo command,
  a minimal SDK snippet, and notes that the list auto-refreshes.
- The published `@agent-replay/cli` bundles `@agent-replay/examples` so `demo`
  is self-contained.
- `@agent-replay/core`, `@agent-replay/sdk`, and `@agent-replay/cli` are now
  publishable (`private: false`, `publishConfig.access: public`).

### Removed
- The CLI's unused alternate Fastify API server, its Drizzle DB layer, and the
  migrations under `packages/cli/drizzle` (Studio is the single source of truth
  for the API). This dropped the `fastify`, `@fastify/cors`, `drizzle-orm`, and
  `drizzle-kit` dependencies from the CLI.

### Notes
- "Replay" means step-by-step playback of a recorded trace, **not** deterministic
  re-execution of the agent.
- Pricing data in `@agent-replay/core` is **static** and hand-maintained; all
  costs are rough estimates and may drift from current provider pricing.
- Existing `~/.agent-replay/studio.db` files keep working. SQLite stored cost
  values as REAL regardless of the old `INTEGER` declaration, so no data
  migration is required; delete the file to start fresh if desired.

### Release checklist (maintainers)
- [ ] Confirm the `repository` / homepage URLs still point to
      `fabriutola-hub/StepLens`.
- [ ] `pnpm install && pnpm typecheck && pnpm test && pnpm build` all green.
- [ ] `npm pack --dry-run` for core/sdk/cli lists only `dist/` + `README.md`.
- [ ] `pnpm -r publish --access public` for the three public packages.

[0.1.0]: https://github.com/fabriutola-hub/StepLens/releases/tag/v0.1.0
