# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and the project aims
to follow [Semantic Versioning](https://semver.org/).

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
