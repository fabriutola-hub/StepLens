# Roadmap

StepLens is a **local-first trace inspector for AI agents**. The
roadmap below is a direction, not a promise — order and scope may change.
Feedback and contributions are welcome (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).

## ✅ 0.1 — Reliable MVP

- Single endpoint (`http://localhost:3000`) across SDK, CLI, and Studio.
- `createClient()` with env vars + `shutdown()`.
- Timeline, graph, inspector, and step-by-step replay.
- USD-decimal cost estimates, export, tests/CI, OSS scaffolding.

## ✅ 0.2 — Developer experience

- **Simple SDK API** — `@agent-replay/sdk/simple`: `createReplay`, `record`,
  `run.step` / `run.tool` / `run.model`.
- **Starter templates** — `agent-replay new simple|error|openai|ollama`.
- **Shareable traces** — `POST /api/import` (+ `?replace=true`),
  `DELETE /api/traces/:id`, and `agent-replay import`.
- **First integration** — `wrapOpenAI` (`@agent-replay/sdk/integrations/openai`).
- **Docs & distribution** — comparison page, screenshots, and a `Dockerfile`
  for running Studio standalone.

## ✅ 0.3 — Integrations (this release)

- **Vercel AI SDK** — `wrapAISDK({ generateText, streamText, … })` with
  multi-step + tool-call capture.
- **LangChain / LangGraph** — `createLangChainCallbackHandler()` mapping
  chains/tools/retrievers/LLMs to spans, tool calls, and model calls.
- **Anthropic + Google wrappers** — `wrapAnthropic`, `wrapGoogleGenAI`
  (structural types, no hard deps).
- **Streaming capture** — OpenAI `stream: true`, Anthropic `finalMessage()`,
  Gemini `generateContentStream`; recorded on completion, never auto-drained.
- **Optional model-call timestamps** — `startedAt` / `endedAt` / `durationMs`
  on `recordModelCall` (backward compatible).
- **More templates** — `agent-replay new vercel-ai|anthropic|google|langchain`.

## ✅ 0.4 — Packaging & distribution

- Published, versioned Docker image.
- `npx steplens` standalone runner (Studio without the monorepo).
- Smoother global install.
- OpenTelemetry export bridge.

## ✅ 0.65 — Studio Workbench

- **Advanced search & filtering** — query, status, time range, model, tool,
  errors, favorites, and tags, with sortable columns.
- **Filtered stats strip** — counts, p95/avg duration, tokens, cost, error rate.
- **Local annotations** — favorites, tags, and notes (Studio-only, not exported).
- **Saved views** — name and reuse a workbench filter set.
- **Trace comparison** — side-by-side deltas for duration, cost, tokens, errors,
  models, tools, and matched spans.
- **Summary & hotspots** — slowest spans/models/tools and errors in the detail
  view, with click-to-select into the timeline.
- **Additive migrations** — `schema_migrations` upgrades older DBs in place.

## ✅ 0.66 — Studio Polish (this release)

- **Keyboard-first UI** — page-aware shortcuts (`/`, `e`, `r`, `c`, `b`,
  `s`/`t`/`g`/`v`/`d`, `f`) and a `?` help overlay.
- **Dark mode** — light/dark/system toggle, FOUC-free initial paint,
  persisted to `localStorage`.
- **Health endpoint** — `GET /api/health` for Docker `HEALTHCHECK` /
  Kubernetes readiness probes.
- **CSV export** of the filtered Workbench list (RFC 4180, UTF-8 BOM).
- **Toasts + confirm-before-delete** — destructive actions now ask first
  and report back.
- **Lint-clean Studio** — 27 → 0 errors under Next 16 / React 19 strict
  rules (no `any` in route handlers, no setState-in-effect anywhere).

## Later / under consideration

- Lightweight evals over recorded traces.
- Pluggable storage backends beyond SQLite.

## Explicit non-goals (for now)

- Accounts, authentication, multi-tenancy, or cloud hosting.
- Production monitoring / alerting.

Agent Replay stays **local-first** until there's a compelling reason — and a safe
design — to change that.
