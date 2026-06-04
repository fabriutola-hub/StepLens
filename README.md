# StepLens

[![CI](https://github.com/fabriutola-hub/StepLens/actions/workflows/ci.yml/badge.svg)](https://github.com/fabriutola-hub/StepLens/actions/workflows/ci.yml)
[![Release](https://github.com/fabriutola-hub/StepLens/actions/workflows/release.yml/badge.svg)](https://github.com/fabriutola-hub/StepLens/actions/workflows/release.yml)
![Version](https://img.shields.io/badge/version-0.4.0-blue.svg)
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)

**A local-first trace inspector for AI agents.** Record what your agent did —
spans, model calls, tool calls, errors, tokens, and estimated cost — and explore
it in a local web UI as a timeline, a graph, or step-by-step.

Everything runs on your machine. No accounts, no cloud, no API keys. Traces are
stored in a local SQLite file (`~/.agent-replay/studio.db`).

> **What "replay" means here:** stepping through a recorded trace event-by-event
> (play / pause / step / seek) to see what happened. It is **not** deterministic
> re-execution of your agent.

![Trace detail with timeline and replay](docs/images/trace-detail.png)

---

## Quickstart

**install → start Studio → demo → see trace.** Requirements: **Node.js ≥ 18**.

```bash
npx steplens dev          # 1. start Studio → http://localhost:3000  (leave running)
npx steplens demo         # 2. (new terminal) record 3 example traces
```

Now open **http://localhost:3000** — the traces appear and the list
auto-refreshes. Click one to explore it.

| Trace list | Graph view |
| --- | --- |
| ![Trace list](docs/images/trace-list.png) | ![Trace graph](docs/images/trace-graph.png) |

Want your own first trace? Scaffold and run an example:

```bash
npx steplens new simple         # writes steplens-example.mjs
node steplens-example.mjs       # records a "Simple Agent" trace
```

> **Developing StepLens itself?** Clone the repo and use `pnpm install && pnpm build`,
> then `pnpm dev` to start Studio from source.

---

## Record from your own agent

The simplest way (recommended) is the `@agent-replay/sdk/simple` API:

```ts
import { createReplay } from "@agent-replay/sdk/simple";

// Defaults to http://localhost:3000; reads AGENT_REPLAY_ENDPOINT / AGENT_REPLAY_ENABLED.
const replay = createReplay();

await replay.record("My Agent", async (run) => {
  const docs = await run.step("Search docs", async () => searchDocs());

  const answer = await run.model(
    "openai:gpt-4o",
    { messages: [{ role: "user", content: "Summarize the docs" }] },
    async () => callModel(docs), // return { response, inputTokens, outputTokens }
  );

  return answer.response;
});

await replay.shutdown(); // flush before exit
```

- `run.step(name, fn)` — an auto-managed span (nests naturally).
- `run.tool(name, input, fn)` — records a tool call's input/output.
- `run.model("provider:model", opts, fn)` — records a model call + estimated cost.

Using a real LLM stack? Wrap your client/functions once and calls made inside
`record()` are captured automatically — spans, model calls, tool calls,
completed streams, tokens, and estimated cost:

```ts
import { wrapOpenAI } from "@agent-replay/sdk/integrations/openai";
const openai = wrapOpenAI(new OpenAI(), { replay });
```

### Integrations

| Integration | Import | Wrap | Streaming | Template |
| ----------- | ------ | ---- | --------- | -------- |
| **OpenAI** | `@agent-replay/sdk/integrations/openai` | `wrapOpenAI(client)` | `stream: true` (recorded when fully consumed) | `steplens new openai` |
| **Vercel AI SDK** | `@agent-replay/sdk/integrations/vercel-ai` | `wrapAISDK({ generateText, streamText, … })` | `streamText` / `streamObject` via `onFinish` | `steplens new vercel-ai` |
| **Anthropic** | `@agent-replay/sdk/integrations/anthropic` | `wrapAnthropic(client)` | `messages.stream(…).finalMessage()` | `steplens new anthropic` |
| **Google Gemini** | `@agent-replay/sdk/integrations/google` | `wrapGoogleGenAI(client)` | `generateContentStream` (recorded when fully consumed) | `steplens new google` |
| **LangChain / LangGraph** | `@agent-replay/sdk/integrations/langchain` | `createLangChainCallbackHandler()` | via LangChain callbacks | `steplens new langchain` |
| **Ollama** | — (use `run.model("ollama:…")`) | — | — | `steplens new ollama` |

All integrations use **structural types only** — none of `openai`, `ai`,
`@anthropic-ai/sdk`, `@google/genai`, or `@langchain/*` are dependencies of the
SDK. You pass in your real client/functions; outside `record()` everything
passes through untouched, and **streams are never consumed on your behalf**.

A LangChain agent recorded with `createLangChainCallbackHandler()` — spans,
model calls, tool calls, tokens, and estimated cost:

![LangChain trace in StepLens](docs/images/trace-langchain.png)

The lower-level `createClient` / `Trace` / `Span` API is still fully supported.
Full details in [`docs/sdk.md`](docs/sdk.md).

---

## OpenTelemetry Bridge

Export any StepLens trace to **OTLP/HTTP JSON** and send it to your favorite
observability backend (Jaeger, Grafana Tempo, Datadog, etc.).

```bash
# Export a trace as OTLP JSON
npx steplens otel export <traceId> --out trace-otlp.json

# Send a trace directly to an OTLP collector
npx steplens otel send <traceId> --otlp-endpoint http://localhost:4318/v1/traces

# Export from a local file instead of Studio
npx steplens otel export --file trace.json --out trace-otlp.json
```

The bridge uses **deterministic IDs** (SHA-256 hashes), maps StepLens spans,
model calls, and tool calls to OTel spans with **GenAI semantic conventions**
(`gen_ai.system`, `gen_ai.request.model`, token usage, estimated cost), and
**excludes prompts/responses by default** — use `--include-content` to opt in.

Endpoint resolution order:
1. `--otlp-endpoint` flag
2. `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` env var
3. `OTEL_EXPORTER_OTLP_ENDPOINT` + `/v1/traces`
4. Fallback: `http://localhost:4318/v1/traces`

Programmatic API via `@agent-replay/otel`:

```ts
import { toOtlpTrace, sendOtlpTrace } from "@agent-replay/otel";

const otlpPayload = toOtlpTrace(traceExport);
await sendOtlpTrace(traceExport, { otlpEndpoint: "http://localhost:4318/v1/traces" });
```

---

## Run Studio with Docker

Use the pre-built image from GitHub Container Registry:

```bash
docker run --rm -p 3000:3000 -v steplens-data:/data ghcr.io/fabriutola-hub/steplens:latest
```

Or build from source:

```bash
docker build -t steplens .
docker run --rm -p 3000:3000 -v steplens-data:/data steplens
```

Then point the SDK/CLI at `http://localhost:3000` as usual. The volume persists
the local SQLite database across runs.

---

## CLI Reference

The `steplens` CLI (also available as `agent-replay` for backward compatibility):

| Command | Description |
| ------- | ----------- |
| `steplens dev` | Start Studio server and open browser |
| `steplens demo` | Record 3 example agent traces |
| `steplens new [template]` | Scaffold a runnable example file |
| `steplens status` | Check if Studio is alive |
| `steplens open` | Open Studio in the default browser |
| `steplens doctor` | Check system requirements |
| `steplens init` | Create a `.env` with SDK variables |
| `steplens record -- <cmd>` | Run a command with recording enabled |
| `steplens export <traceId>` | Export a trace to JSON |
| `steplens import <file>` | Import a trace from JSON |
| `steplens otel export` | Export a trace as OTLP JSON |
| `steplens otel send` | Send a trace to an OTLP collector |

Use `npx steplens <command> --help` for detailed options.

---

## What's in the box

| Package | Description |
| ------- | ----------- |
| [`steplens`](packages/steplens) | Public npm package — install and run with `npx steplens` |
| [`@agent-replay/sdk`](packages/sdk) | Recording client — simple API (`createReplay`), core API (`createClient`), integrations |
| [`@agent-replay/core`](packages/core) | Shared types, Zod schemas, and (static) model cost lookup |
| [`@agent-replay/cli`](packages/cli) | The CLI (`steplens` / `agent-replay` commands) |
| [`@agent-replay/otel`](packages/otel) | OpenTelemetry bridge — convert and export traces to OTLP/HTTP JSON |
| `@agent-replay/studio` | The Next.js UI + ingest/query/import API (runs at `localhost:3000`) |
| `@agent-replay/examples` | Demo agents used by `steplens demo` (bundled into the CLI) |

See [`docs/architecture.md`](docs/architecture.md) for how data flows.

---

## Documentation

- [Quickstart](docs/quickstart.md) — install → first trace, in detail
- [SDK](docs/sdk.md) — simple API, core API, env vars, integrations
- [CLI](docs/cli.md) — every command, with examples
- [Architecture](docs/architecture.md) — packages, data model, costs, storage
- [Comparison](docs/comparison.md) — vs LangSmith, Helicone, OpenTelemetry
- [Roadmap](ROADMAP.md)

---

## Costs and tokens

Studio shows **estimated** cost in **US dollars** (e.g. `$0.0075`), labeled
"Est.". Pricing comes from a **static, hand-maintained table** in
`@agent-replay/core` and will drift as providers change prices — treat costs as
rough estimates, not billing figures. Unknown models simply show no cost.

---

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `steplens demo` says "Studio is not reachable" | Start Studio first: `npx steplens dev`. Confirm it's at `http://localhost:3000`. |
| Port 3000 in use | Use `npx steplens dev -p 3001` and pass `-e http://localhost:3001` to CLI commands. |
| No traces appear | The list auto-refreshes every few seconds. Make sure your SDK client points at the same endpoint and that you call `await replay.shutdown()` before exit. |
| Not sure your setup is healthy | Run `npx steplens doctor`. |
| Want a clean slate | Delete `~/.agent-replay/studio.db` (and `-wal`/`-shm` files). |

---

## Project status

**v0.4.0** — installable CLI, standalone Studio from npm, versioned Docker
images on GHCR, and OpenTelemetry bridge. It is **local-first** and
intentionally has **no authentication, accounts, or cloud** — do not expose it
to an untrusted network (see [`SECURITY.md`](SECURITY.md)). APIs may still
evolve before `1.0`.

Contributions welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md). Licensed under
[MIT](LICENSE).
