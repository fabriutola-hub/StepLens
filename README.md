# StepLens

[![CI](https://github.com/fabriutola-hub/StepLens/actions/workflows/ci.yml/badge.svg)](https://github.com/fabriutola-hub/StepLens/actions/workflows/ci.yml)
[![Release](https://github.com/fabriutola-hub/StepLens/actions/workflows/release.yml/badge.svg)](https://github.com/fabriutola-hub/StepLens/actions/workflows/release.yml)
![Version](https://img.shields.io/badge/version-0.8.0-blue.svg)
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D22.13-brightgreen.svg)
![pnpm](https://img.shields.io/badge/pnpm-11.5.1-orange.svg)

**StepLens is a local-first trace inspector for AI agents.** It records
what an agent did — spans, model calls, tool calls, errors, tokens, and
estimated cost — then lets you inspect the run in a local Studio UI as
a timeline, graph, event log, or step-by-step replay.

No accounts, hosted service, or vendor lock-in. Studio runs on your
machine and stores traces in a local SQLite database at
`~/.agent-replay/studio.db`.

> **Replay means inspection playback.** StepLens can play, pause, step,
> and seek through a recorded trace. It does not deterministically
> re-run your agent.

![Trace detail with timeline and replay](docs/images/trace-detail.png)

## Why StepLens

- **Local-first** — no SaaS, no accounts, no telemetry. Your prompt
  data never leaves your machine.
- **Zero-friction setup** — `npx steplens dev` and you're inspecting
  traces in 10 seconds.
- **Works with any LLM stack** — OpenAI, Anthropic, Google Gemini,
  Vercel AI SDK, LangChain, Ollama. Wrappers use structural types so
  you bring your own real client.
- **Rich Workbench** — search, facets, sortable table, stats strip,
  activity heat map, bulk operations, cost budget alerts, settings
  panel, bilingual UI (EN/ES), live SSE updates.
- **OpenTelemetry interop** — convert a trace to OTLP/HTTP JSON and
  ship it to your existing collector.
- **Works in CI** — `--record` runs a command with the right env
  vars, and `studio` ships a slim Docker image for shared use.

## Quickstart

Requirements: **Node.js ≥ 22.13** (see [`.nvmrc`](.nvmrc)).

```bash
npx steplens dev          # starts Studio on http://localhost:3000
npx steplens demo         # in another terminal — records 3 sample traces
```

The bundled demo lands traces in the running Studio. Open
<http://localhost:3000>, click into one, and explore the timeline,
graph, events, and data tabs.

| Trace list | Trace detail |
| --- | --- |
| ![Trace list](docs/images/trace-list.png) | ![Trace detail](docs/images/trace-detail.png) |

Record your own minimal example:

```bash
npx steplens new simple
node steplens-example.mjs
```

Or instrument an existing agent with the SDK (no-op if the SDK is
already imported):

```ts
import OpenAI from "openai";
import { createReplay } from "@agent-replay/sdk/simple";
import { wrapOpenAI } from "@agent-replay/sdk/integrations/openai";

const replay = createReplay();           // → http://localhost:3000
const openai = wrapOpenAI(new OpenAI(), { replay });

// Calls made with `openai` are recorded automatically.
```

For production usage, see [`docs/recipes/prod-debug.md`](docs/recipes/prod-debug.md)
and [`docs/recipes/cost-watch.md`](docs/recipes/cost-watch.md).

### Develop this repository from source

```bash
git clone https://github.com/fabriutola-hub/StepLens.git
cd StepLens
corepack enable            # picks up pnpm 11.5.1 from package.json
pnpm install --frozen-lockfile
pnpm build                 # builds every workspace package
pnpm dev                   # http://localhost:3000 (hot reload)
```

## What StepLens Records

- **Trace lifecycle** — start, end, status, input, output, metadata,
  errors.
- **Nested spans** — agent steps, retrieval, parsing, custom work,
  and child spans.
- **Model calls** — provider, model, messages, response, token usage,
  latency, estimated cost (when pricing is known).
- **Tool calls** — tool name, input, output, status, timing.
- **Local metadata** (Studio-only) — favorite, tags, free-text notes,
  saved views. These never leave your machine and are not part of
  exports.

Cost values are estimates in US dollars. Pricing comes from a static
table in `@agent-replay/core`, so treat it as observability context,
not billing data.

## Recording from your agent

The simplest API is `@agent-replay/sdk/simple`:

```ts
import { createReplay } from "@agent-replay/sdk/simple";

const replay = createReplay(); // Defaults to http://localhost:3000

await replay.record("Docs Agent", async (run) => {
  const docs = await run.step("Search docs", async () => searchDocs());

  const answer = await run.model(
    "openai:gpt-4o",
    { messages: [{ role: "user", content: "Summarize the docs" }] },
    async () => callModel(docs),
  );

  await run.tool("save-answer", { id: "summary" }, async () => {
    return saveAnswer(answer.response);
  });

  return answer.response;
});

await replay.shutdown(); // Flush before process exit
```

Using a provider or framework client? Wrap it once and calls made
inside `record()` are captured automatically:

```ts
import OpenAI from "openai";
import { createReplay } from "@agent-replay/sdk/simple";
import { wrapOpenAI } from "@agent-replay/sdk/integrations/openai";

const replay = createReplay();
const openai = wrapOpenAI(new OpenAI(), { replay });
```

## Integrations

StepLens integrations use structural types. The SDK does not add hard
runtime dependencies on `openai`, `ai`, `@anthropic-ai/sdk`,
`@google/genai`, or `@langchain/*`; you pass in the real client you
already use.

| Stack | Import | Wrapper | Template |
| --- | --- | --- | --- |
| OpenAI | `@agent-replay/sdk/integrations/openai` | `wrapOpenAI(client)` | `steplens new openai` |
| Vercel AI SDK | `@agent-replay/sdk/integrations/vercel-ai` | `wrapAISDK({ generateText, streamText, ... })` | `steplens new vercel-ai` |
| Anthropic | `@agent-replay/sdk/integrations/anthropic` | `wrapAnthropic(client)` | `steplens new anthropic` |
| Google Gemini | `@agent-replay/sdk/integrations/google` | `wrapGoogleGenAI(client)` | `steplens new google` |
| LangChain / LangGraph | `@agent-replay/sdk/integrations/langchain` | `createLangChainCallbackHandler()` | `steplens new langchain` |
| Ollama | (use `run.model("ollama:model", ...)`) | Manual / simple API | `steplens new ollama` |

Streaming calls are recorded when the stream is consumed to
completion. StepLens does not drain streams on your behalf.

See [`docs/sdk.md`](docs/sdk.md) for the full SDK reference.

## CLI

The published command is `steplens`. The older `agent-replay` binary
remains available for backward compatibility.

| Command | Description |
| --- | --- |
| `steplens dev` | Start Studio and open the browser |
| `steplens demo` | Record three bundled example traces |
| `steplens new [template]` | Scaffold a runnable example file |
| `steplens stats [--since 24h] [--json]` | Print aggregate stats over a time window |
| `steplens prune [--older-than 30d] [--status error] [--dry-run\|--yes]` | Delete old traces safely |
| `steplens watch [--format text\|json]` | Stream live traces as they happen (SSE) |
| `steplens status` | Check whether Studio is reachable |
| `steplens open` | Open Studio in the default browser |
| `steplens doctor` | Check Node, SQLite, pnpm, and Studio reachability |
| `steplens init` | Create a `.env` with the SDK recording variables |
| `steplens record -- <cmd>` | Run a command with StepLens env vars set |
| `steplens export <traceId>` | Export a trace to a JSON file |
| `steplens import <file>` | Import a trace JSON file into Studio |
| `steplens otel export` | Convert a trace to OTLP/HTTP JSON |
| `steplens otel send` | Send a trace to an OTLP collector |

Run `npx steplens <command> --help` for command-specific options.

## OpenTelemetry Bridge

StepLens can export traces as OTLP/HTTP JSON for observability tools
such as Jaeger, Grafana Tempo, Datadog, and compatible collectors.

```bash
npx steplens otel export <traceId> --out trace-otlp.json
npx steplens otel send <traceId> --otlp-endpoint http://localhost:4318/v1/traces
npx steplens otel export --file trace.json --out trace-otlp.json
```

The bridge maps StepLens spans, model calls, and tool calls to OTel
spans with GenAI semantic attributes. Prompts, responses, and tool
payloads are excluded by default; pass `--include-content` when you
explicitly want to include them.

Programmatic API:

```ts
import { sendOtlpTrace, toOtlpTrace } from "@agent-replay/otel";

const payload = toOtlpTrace(traceExport);
await sendOtlpTrace(traceExport, {
  otlpEndpoint: "http://localhost:4318/v1/traces",
});
```

## Studio features

- **Workbench** with search, facet filters, sortable table, stats
  strip, sticky URL filters, bulk select, keyboard shortcuts.
- **Activity heat map** — 12 weeks × 7 days (GitHub-style) for trace
  activity, with click-to-filter.
- **Cost budget alerts** — set daily / monthly USD budgets in
  Settings; the Workbench shows an amber banner when filtered cost
  exceeds them.
- **Bulk operations** — delete, tag, and export selected traces in
  one action. Bulk export streams a ZIP archive of trace JSONs.
- **Live updates** via Server-Sent Events; polling fallback if SSE
  is disabled in Settings.
- **Settings panel** at `/settings` for theme, language (EN/ES),
  poll interval, page size, sort, budgets, and "Reset to defaults".
- **Recent traces** panel; **error boundary** with copy-and-reload
  affordance; **toast notifications** for success / failure feedback;
  **confirm dialog** before destructive actions.
- **Keyboard shortcuts** — `?` to discover, `/` to focus search,
  `e` to export CSV, `r` to reload, `c` to clear filters, and tab
  shortcuts in the detail view (`b` back, `s`/`t`/`g`/`v`/`d` for
  Summary / Timeline / Graph / Events / Data, `f` to favorite).
- **Dark mode** (light / dark / system) with FOUC-free init.
- **Health endpoint** at `/api/health` for Docker `HEALTHCHECK`
  and Kubernetes readiness probes.

## Docker

Run the published image from GitHub Container Registry:

```bash
docker run --rm -p 3000:3000 -v steplens-data:/data ghcr.io/fabriutola-hub/steplens:latest
```

Or build locally:

```bash
docker build -t steplens .
docker run --rm -p 3000:3000 -v steplens-data:/data steplens
```

Then point the SDK or CLI at `http://localhost:3000`. The mounted
volume keeps the SQLite data across container runs.

A ready-to-use dev environment is in
[`docker-compose.dev.yml`](docker-compose.dev.yml):

```bash
docker compose -f docker-compose.dev.yml up
```

The container exposes a lightweight health endpoint at `/api/health`
— return code is `200` when SQLite is reachable, `503` otherwise.
It's safe to use as a Docker `HEALTHCHECK` or a Kubernetes
readiness probe.

```bash
curl -s http://localhost:3000/api/health | jq
# {
#   "status": "ok",
#   "service": "steplens-studio",
#   "version": "0.8.0",
#   "uptimeMs": 12345,
#   "startedAt": 1717549200000,
#   "db": { "connected": true, "traceCount": 42 }
# }
```

## Keyboard Shortcuts

Studio is fully keyboard-driven. Press `?` anywhere to see the live
list of shortcuts the current page exposes.

| Where | Key | Action |
| --- | --- | --- |
| Anywhere | `?` | Open / close shortcut help |
| Anywhere | `Esc` | Close help overlay |
| Workbench | `/` | Focus search |
| Workbench | `e` | Export filtered list as CSV |
| Workbench | `r` | Reload list |
| Workbench | `c` | Clear all filters |
| Trace detail | `b` | Back to trace list |
| Trace detail | `s` / `t` / `g` / `v` / `d` | Switch to Summary / Timeline / Graph / Events / Data tab |
| Trace detail | `f` | Toggle favorite |

Shortcuts are suppressed while you type in any text field except
`/`, so the search box behaves naturally.

## Theme and language

A three-way theme switch (light / dark / system) lives in the top
nav. Your choice is persisted to `localStorage` and the correct
theme is applied before the first paint — no flash of the wrong
colors on reload.

The UI ships in English and Spanish. Settings lets you pick
"System" (track the browser) or one explicitly.

## Repository Layout

| Package | Description |
| --- | --- |
| [`steplens`](packages/steplens) | Public npm entrypoint for `npx steplens` |
| [`@agent-replay/sdk`](packages/sdk) | Recording client, simple API, integrations |
| [`@agent-replay/core`](packages/core) | Shared types, Zod schemas, cost lookup |
| [`@agent-replay/cli`](packages/cli) | `steplens` and `agent-replay` CLI |
| [`@agent-replay/otel`](packages/otel) | OpenTelemetry bridge |
| [`@agent-replay/studio`](apps/studio) | Next.js UI and ingest/query API |
| [`@agent-replay/examples`](packages/examples) | Demo agents (private; bundled into the CLI) |

Build order is fixed by `turbo.json`: `core → sdk → cli/otel/studio`.
`pnpm build` handles dependency order automatically.

See [`docs/architecture.md`](docs/architecture.md) for how data flows.

## Documentation

- [Quickstart](docs/quickstart.md)
- [SDK reference](docs/sdk.md)
- [CLI reference](docs/cli.md)
- [Architecture](docs/architecture.md)
- [API reference](docs/api-reference.md)
- [Comparison with other tools](docs/comparison.md)
- [FAQ](docs/FAQ.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Migration guides](docs/MIGRATION-0.8.md)
- [Recipes](docs/recipes/) — cost-watch, prod-debug, more
- [Roadmap](ROADMAP.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [Governance](GOVERNANCE.md)

## Security

StepLens is designed for local development. Studio has no
authentication or authorization, and the ingest API accepts local
unauthenticated writes by design. Do not expose Studio to an
untrusted network unless you put your own authentication and TLS in
front of it.

Trace data can include prompts, model responses, tool inputs, tool
outputs, and other sensitive application data. It is stored locally
in plaintext SQLite.

Report security issues privately per [SECURITY.md](SECURITY.md).

## Project Status

Current version: **0.8.0**.

StepLens is installable from npm, runs Studio locally, includes SDK
integrations for common LLM stacks, ships Docker support, and can
export traces to OpenTelemetry. The `0.8.0` "Open Source Quality"
release adds the Workbench's bulk operations, activity heat map,
Settings panel, live SSE updates, and the CLI's `stats`/`prune`/
`watch` commands. The codebase is lint-clean under Next 16 / React
19 strict rules and ships bilingual UI (EN/ES) with a cost-budget
alert banner. APIs may still evolve before `1.0`.

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).
StepLens is licensed under the [MIT License](LICENSE).
