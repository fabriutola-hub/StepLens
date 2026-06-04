# Roadmap

StepLens is a **local-first trace inspector for AI agents**. The
roadmap below is a direction, not a promise — order and scope may change.
Feedback and contributions are welcome (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).

## ✅ 0.1 — Reliable MVP

- Single endpoint (`http://localhost:3000`) across SDK, CLI, and Studio.
- `createClient()` with env vars + `shutdown()`.
- Timeline, graph, inspector, and step-by-step replay.
- USD-decimal cost estimates, export, tests/CI, OSS scaffolding.

## ✅ 0.2 — Developer experience (this release)

- **Simple SDK API** — `@agent-replay/sdk/simple`: `createReplay`, `record`,
  `run.step` / `run.tool` / `run.model`.
- **Starter templates** — `agent-replay new simple|error|openai|ollama`.
- **Shareable traces** — `POST /api/import` (+ `?replace=true`),
  `DELETE /api/traces/:id`, and `agent-replay import`.
- **First integration** — `wrapOpenAI` (`@agent-replay/sdk/integrations/openai`).
- **Docs & distribution** — comparison page, screenshots, and a `Dockerfile`
  for running Studio standalone.

## 0.3 — Integrations

- Vercel AI SDK integration.
- LangChain / LangGraph callback handler.
- Anthropic + Google client wrappers (structural, no hard deps).
- Auto-capture of streaming responses and token usage.

## 0.4 — Packaging & distribution

- Published, versioned Docker image.
- `npx agent-replay` standalone runner (Studio without the monorepo).
- Prebuilt binaries / smoother global install.
- Optional OpenTelemetry export bridge.

## Later / under consideration

- Diffing two traces side by side.
- Lightweight evals over recorded traces.
- Pluggable storage backends beyond SQLite.

## Explicit non-goals (for now)

- Accounts, authentication, multi-tenancy, or cloud hosting.
- Production monitoring / alerting.

Agent Replay stays **local-first** until there's a compelling reason — and a safe
design — to change that.
