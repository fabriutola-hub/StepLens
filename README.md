# StepLens

[![CI](https://github.com/fabriutola-hub/StepLens/actions/workflows/ci.yml/badge.svg)](https://github.com/fabriutola-hub/StepLens/actions/workflows/ci.yml)
[![Release](https://github.com/fabriutola-hub/StepLens/actions/workflows/release.yml/badge.svg)](https://github.com/fabriutola-hub/StepLens/actions/workflows/release.yml)
![Version](https://img.shields.io/badge/version-0.8.0-blue.svg)
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)

**StepLens is a local-first trace inspector for AI agents.** It records what an
agent did - spans, model calls, tool calls, errors, tokens, and estimated cost -
then lets you inspect the run in a local Studio UI as a timeline, graph, event
log, or step-by-step replay.

No accounts, hosted service, or vendor lock-in are required. Studio runs on your
machine and stores traces in a local SQLite database at
`~/.agent-replay/studio.db`.

> **Replay means inspection playback.** StepLens can play, pause, step, and seek
> through a recorded trace. It does not deterministically re-run your agent.

![Trace detail with timeline and replay](docs/images/trace-detail.png)

## Quickstart

Requirements: **Node.js >= 18**.

Start Studio, record the bundled demo traces, then open the UI:

```bash
npx steplens dev
npx steplens demo
```

Studio runs at [http://localhost:3000](http://localhost:3000). Leave
`npx steplens dev` running in one terminal and run `npx steplens demo` from
another terminal.

| Trace list | Graph view |
| --- | --- |
| ![Trace list](docs/images/trace-list.png) | ![Trace graph](docs/images/trace-graph.png) |

Generate your own minimal example:

```bash
npx steplens new simple
node steplens-example.mjs
```

Developing this repository from source:

```bash
pnpm install
pnpm build
pnpm dev
```

## What StepLens Records

- Trace lifecycle: start, end, status, input, output, metadata, and errors.
- Nested spans: agent steps, retrieval, parsing, custom work, and child spans.
- Model calls: provider, model, messages, responses, token usage, latency, and
  estimated cost when pricing data is known.
- Tool calls: tool name, input, output, status, and timing.
- Logs and replay events for step-by-step inspection in Studio.

Cost values are estimates in US dollars. Pricing comes from a static table in
`@agent-replay/core`, so treat it as observability context, not billing data.

## Record From Your Agent

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

Using a provider or framework client? Wrap it once and calls made inside
`record()` are captured automatically:

```ts
import OpenAI from "openai";
import { createReplay } from "@agent-replay/sdk/simple";
import { wrapOpenAI } from "@agent-replay/sdk/integrations/openai";

const replay = createReplay();
const openai = wrapOpenAI(new OpenAI(), { replay });
```

## Integrations

StepLens integrations use structural types. The SDK does not add hard runtime
dependencies on `openai`, `ai`, `@anthropic-ai/sdk`, `@google/genai`, or
`@langchain/*`; you pass in the real client or functions you already use.

| Stack | Import | Wrapper | Template |
| --- | --- | --- | --- |
| OpenAI | `@agent-replay/sdk/integrations/openai` | `wrapOpenAI(client)` | `steplens new openai` |
| Vercel AI SDK | `@agent-replay/sdk/integrations/vercel-ai` | `wrapAISDK({ generateText, streamText, ... })` | `steplens new vercel-ai` |
| Anthropic | `@agent-replay/sdk/integrations/anthropic` | `wrapAnthropic(client)` | `steplens new anthropic` |
| Google Gemini | `@agent-replay/sdk/integrations/google` | `wrapGoogleGenAI(client)` | `steplens new google` |
| LangChain / LangGraph | `@agent-replay/sdk/integrations/langchain` | `createLangChainCallbackHandler()` | `steplens new langchain` |
| Ollama | Use `run.model("ollama:model", ...)` | Manual/simple API | `steplens new ollama` |

Streaming calls are recorded when the stream is consumed to completion. StepLens
does not drain streams on your behalf.

![LangChain trace in StepLens](docs/images/trace-langchain.png)

See [docs/sdk.md](docs/sdk.md) for the full SDK reference.

## CLI

The published command is `steplens`. The older `agent-replay` binary remains
available for backward compatibility.

| Command | Description |
| --- | --- |
| `steplens dev` | Start Studio and open the browser |
| `steplens demo` | Record three bundled example traces |
| `steplens new [template]` | Scaffold a runnable example file |
| `steplens status` | Check whether Studio is reachable |
| `steplens open` | Open Studio in the default browser |
| `steplens doctor` | Check Node, SQLite, pnpm in monorepo mode, and Studio reachability |
| `steplens init` | Create a `.env` with SDK recording variables |
| `steplens record -- <cmd>` | Run a command with StepLens environment variables |
| `steplens export <traceId>` | Export a trace to JSON |
| `steplens import <file>` | Import a trace JSON file into Studio |
| `steplens otel export` | Convert a trace to OTLP/HTTP JSON |
| `steplens otel send` | Send a trace to an OTLP collector |

Run `npx steplens <command> --help` for command-specific options.

## OpenTelemetry Bridge

StepLens can export traces as OTLP/HTTP JSON for observability tools such as
Jaeger, Grafana Tempo, Datadog, and compatible collectors.

```bash
npx steplens otel export <traceId> --out trace-otlp.json
npx steplens otel send <traceId> --otlp-endpoint http://localhost:4318/v1/traces
npx steplens otel export --file trace.json --out trace-otlp.json
```

The bridge maps StepLens spans, model calls, and tool calls to OTel spans with
GenAI semantic attributes. Prompts, responses, and tool payloads are excluded by
default; pass `--include-content` when you explicitly want to include them.

Programmatic API:

```ts
import { sendOtlpTrace, toOtlpTrace } from "@agent-replay/otel";

const payload = toOtlpTrace(traceExport);
await sendOtlpTrace(traceExport, {
  otlpEndpoint: "http://localhost:4318/v1/traces",
});
```

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

Then point the SDK or CLI at `http://localhost:3000`. The mounted volume keeps
the SQLite data across container runs.

The container exposes a lightweight **health endpoint** at `/api/health` —
return code is `200` when SQLite is reachable, `503` otherwise. It's safe to
use as a Docker `HEALTHCHECK` or a Kubernetes readiness probe.

```bash
curl -s http://localhost:3000/api/health | jq
# {
#   "status": "ok",
#   "service": "steplens-studio",
#   "version": "0.66.0",
#   "uptimeMs": 12345,
#   "startedAt": 1717549200000,
#   "db": { "connected": true, "traceCount": 42 }
# }
```

## Keyboard Shortcuts

Studio is fully keyboard-driven. Press `?` anywhere to see the live list of
shortcuts the current page exposes.

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

Shortcuts are suppressed while you type in any text field except `/`, so the
search box behaves naturally.

## Theme

A three-way theme switch (light / dark / system) lives in the top nav. Your
choice is persisted to `localStorage` and the correct theme is applied before
the first paint — no flash of the wrong colors on reload.

## Repository Layout

| Package | Description |
| --- | --- |
| [`steplens`](packages/steplens) | Public npm entrypoint for `npx steplens` |
| [`@agent-replay/sdk`](packages/sdk) | Recording SDK, simple API, core API, and integrations |
| [`@agent-replay/core`](packages/core) | Shared types, schemas, normalization, and model cost lookup |
| [`@agent-replay/cli`](packages/cli) | CLI implementation for `steplens` and `agent-replay` |
| [`@agent-replay/otel`](packages/otel) | OpenTelemetry conversion and OTLP sender |
| [`@agent-replay/studio`](apps/studio) | Next.js Studio UI and ingest/query/import/export API |
| [`@agent-replay/examples`](packages/examples) | Demo agents bundled into the CLI |

See [docs/architecture.md](docs/architecture.md) for the data flow and package
boundaries.

## Documentation

- [Quickstart](docs/quickstart.md)
- [SDK reference](docs/sdk.md)
- [CLI reference](docs/cli.md)
- [Architecture](docs/architecture.md)
- [Comparison](docs/comparison.md)
- [Roadmap](ROADMAP.md)
- [Security policy](SECURITY.md)

## Security

StepLens is designed for local development. Studio has no authentication or
authorization, and the ingest API accepts local unauthenticated writes by
design. Do not expose Studio to an untrusted network unless you put your own
authentication and TLS in front of it.

Trace data can include prompts, model responses, tool inputs, tool outputs, and
other sensitive application data. It is stored locally in plaintext SQLite.

## Project Status

Current version: **0.8.0**.

StepLens is installable from npm, can run Studio locally, includes SDK
integrations for common LLM stacks, ships Docker support, and can export traces
to OpenTelemetry. The `0.66` Polish release rounds off the Workbench with
keyboard shortcuts, a dark-mode toggle, a `/api/health` probe, CSV export of
filtered traces, toast notifications, and a confirm-before-delete dialog. The
Studio codebase is now lint-clean under Next 16 / React 19 strict rules. All
still local-first, with no cloud, accounts, or production-monitoring scope.
APIs may still evolve before `1.0`.

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). StepLens is
licensed under the [MIT License](LICENSE).
