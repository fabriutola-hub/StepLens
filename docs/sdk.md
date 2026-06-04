# SDK — `@agent-replay/sdk`

The SDK records what your agent does and sends it to Studio. There are two
layers:

- **Simple API** (`@agent-replay/sdk/simple`) — the recommended entry point for
  most users.
- **Core API** (`@agent-replay/sdk`) — `createClient` + `Trace`/`Span`, for full
  control. Still fully supported.

## Install

Within this monorepo the package is already linked. In an external project:

```bash
pnpm add @agent-replay/sdk
```

## Simple API (recommended) — `@agent-replay/sdk/simple`

```ts
import { createReplay } from "@agent-replay/sdk/simple";

const r = createReplay({ endpoint: "http://localhost:3000" });

await r.record("My Agent", async (run) => {
  const docs = await run.step("Search docs", async () => searchDocs());
  const answer = await run.step("Generate answer", async () => makeAnswer(docs));
  return answer;
});

await r.shutdown();
```

- **`createReplay(options?)`** — same options as `createClient` (`endpoint`,
  `enabled`, `collector`, `http`); reads `AGENT_REPLAY_ENDPOINT` /
  `AGENT_REPLAY_ENABLED`.
- **`r.record(name, fn, options?)`** — opens a trace, runs `fn(run)`, ends the
  trace on success (storing the return value as output) or marks it failed and
  re-throws on error. **Flushes by default** when it finishes (pass
  `{ flush: false }` to opt out).
- The `run` scope:
  - **`run.step(name, fn, { kind?, attributes? })`** — wraps `fn` in a span
    (auto success/error). The callback receives a nested `run` for sub-steps, so
    spans nest naturally.
  - **`run.tool(toolName, input, fn, { metadata? })`** — records a tool call with
    its input/output (or error).
  - **`run.model("provider:model", { messages?, prompt?, metadata? }, fn)`** —
    records a model call; `fn` returns `{ response?, inputTokens?, outputTokens? }`
    and cost is estimated automatically. `"provider:model"` parses into provider
    + model (e.g. `"openai:gpt-4o"`, `"ollama:llama3.2"`); an unprefixed ref uses
    the `custom` provider.
  - **`run.log(name, data?)`** — records a log event.
- **`r.flush()` / `r.shutdown()`** — flush buffered events / flush and release
  timers before exit.

There's also a lazy default for quick scripts:

```ts
import { replay } from "@agent-replay/sdk/simple";
await replay.record("My Agent", async (run) => { /* ... */ });
await replay.shutdown();
```

Generate a ready-to-run example with `agent-replay new simple` (see
[`cli.md`](cli.md)).

## Integrations

All integrations share the same contract:

- **Structural types only** — `openai`, `ai`, `@anthropic-ai/sdk`,
  `@google/genai`, and `@langchain/*` are **not** dependencies of the SDK. You
  pass in your real client/functions.
- Calls made **outside** a `record()` run pass through untouched — nothing is
  recorded, nothing breaks.
- **Streams are recorded when you finish consuming them** — never at start, and
  the SDK never drains a stream on your behalf. Abandon a stream and nothing is
  recorded.

### OpenAI — `@agent-replay/sdk/integrations/openai`

Wrap an OpenAI client so calls made **inside** a `record()` run are recorded
automatically.

```ts
import { createReplay } from "@agent-replay/sdk/simple";
import { wrapOpenAI } from "@agent-replay/sdk/integrations/openai";
import OpenAI from "openai";

const replay = createReplay();
const openai = wrapOpenAI(new OpenAI(), { replay });

await replay.record("OpenAI Agent", async () => {
  await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Hello" }],
  });
});
await replay.shutdown();
```

Supports `chat.completions.create` and `responses.create`, including
`{ stream: true }` on both: you get the stream back untouched, and the model
call (accumulated text + usage, when the API sends it) is recorded once you
consume the stream to completion. Pass
`stream_options: { include_usage: true }` to chat completions to get token
usage on streams. Generate an example with `agent-replay new openai`.

> Ollama doesn't need a wrapper — use `run.model("ollama:...", ...)` directly
> (try `agent-replay new ollama`).

### Vercel AI SDK — `@agent-replay/sdk/integrations/vercel-ai`

Wrap the AI SDK core functions you use (`generateText`, `streamText`, and
optionally `generateObject` / `streamObject`):

```ts
import { createReplay } from "@agent-replay/sdk/simple";
import { wrapAISDK } from "@agent-replay/sdk/integrations/vercel-ai";
import { generateText, streamText } from "ai";
import { openai } from "@ai-sdk/openai";

const replay = createReplay();
const ai = wrapAISDK({ generateText, streamText }, { replay });

await replay.record("AI SDK Agent", async () => {
  const { text } = await ai.generateText({
    model: openai("gpt-4o-mini"),
    prompt: "Hello",
  });
});
await replay.shutdown();
```

- `generateText` / `generateObject` record when the result resolves.
- `streamText` / `streamObject` record via `onFinish` / `onError` — your own
  callbacks are preserved and still called.
- Multi-step calls record one model call per step (via `onStepFinish` /
  `steps`), plus each step's tool calls (with matched results).
- The model can be a gateway string (`"openai/gpt-4o-mini"`) or a language
  model object (`openai("gpt-4o-mini")`) — provider and model id are extracted
  either way.

Generate an example with `agent-replay new vercel-ai`.

### Anthropic — `@agent-replay/sdk/integrations/anthropic`

```ts
import { createReplay } from "@agent-replay/sdk/simple";
import { wrapAnthropic } from "@agent-replay/sdk/integrations/anthropic";
import Anthropic from "@anthropic-ai/sdk";

const replay = createReplay();
const anthropic = wrapAnthropic(new Anthropic(), { replay });

await replay.record("Anthropic Agent", async () => {
  await anthropic.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 256,
    messages: [{ role: "user", content: "Hello" }],
  });

  // Streaming: recorded when you await finalMessage().
  const stream = anthropic.messages.stream({ /* ... */ });
  await stream.finalMessage();
});
await replay.shutdown();
```

Records `usage.input_tokens` / `usage.output_tokens`, the text content, and
metadata (`stop_reason`, message `id`, cache tokens when present). Streaming
via `messages.stream(...)` is recorded **only** when you call/await
`finalMessage()`; iterating raw events yourself records nothing. Generate an
example with `agent-replay new anthropic`.

### Google Gemini — `@agent-replay/sdk/integrations/google`

```ts
import { createReplay } from "@agent-replay/sdk/simple";
import { wrapGoogleGenAI } from "@agent-replay/sdk/integrations/google";
import { GoogleGenAI } from "@google/genai";

const replay = createReplay();
const ai = wrapGoogleGenAI(new GoogleGenAI({}), { replay });

await replay.record("Gemini Agent", async () => {
  await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: "Hello",
  });

  // Streaming: a transparent async iterable; recorded when fully consumed.
  const stream = await ai.models.generateContentStream({ /* ... */ });
  for await (const chunk of stream) process.stdout.write(chunk.text ?? "");
});
await replay.shutdown();
```

Records `usageMetadata` (`promptTokenCount` / `candidatesTokenCount` as
input/output tokens, `totalTokenCount` in metadata) plus `modelVersion` and
`responseId`. For streams, text accumulates per chunk and the last
`usageMetadata` wins. Generate an example with `agent-replay new google`.

### LangChain / LangGraph — `@agent-replay/sdk/integrations/langchain`

A callback handler instead of a wrapper — pass it via `callbacks`:

```ts
import { createReplay } from "@agent-replay/sdk/simple";
import { createLangChainCallbackHandler } from "@agent-replay/sdk/integrations/langchain";

const replay = createReplay();
const handler = createLangChainCallbackHandler();

await replay.record("LangChain Agent", async () => {
  await chain.invoke({ question: "..." }, { callbacks: [handler] });
});
await replay.shutdown();
```

Mapping: chains/agents → spans (`agent` for root runs, `custom` nested),
retrievers → `retrieval` spans, tools → spans + tool calls, LLM/chat models →
spans + model calls. The `runId` / `parentRunId` hierarchy is preserved,
`handle*Error` callbacks record failures, and tokens are read from
`llmOutput.tokenUsage`, `usage_metadata`, `response_metadata.tokenUsage`, or
equivalents when present.

It can also open a trace by itself (no `record()` needed) around the first
root run:

```ts
const handler = createLangChainCallbackHandler({ replay, traceName: "My Chain" });
await chain.invoke({ question: "..." }, { callbacks: [handler] });
```

Generate an example with `agent-replay new langchain`.

## Core API — `createClient(options?)`

The lower-level entry point. It records to a running Studio over HTTP.

```ts
import { createClient } from "@agent-replay/sdk";

const replay = createClient();
```

### Options

| Option | Type | Default | Notes |
| ------ | ---- | ------- | ----- |
| `endpoint` | `string` | `http://localhost:3000` | Studio base URL. **Primary option.** |
| `enabled` | `boolean` | `true` | When `false`, all recording is a no-op (no HTTP, no timers). |
| `collector` | `Collector` | `HttpCollector` | Supply your own (e.g. `MemoryCollector`) for offline/testing. |
| `http` | `HttpCollectorOptions` | — | Advanced HTTP tuning (batch size, flush interval, retries, callbacks). |

### Endpoint resolution order

`endpoint` → `http.baseUrl` → `process.env.AGENT_REPLAY_ENDPOINT` → `http://localhost:3000`.

### Environment variables

- `AGENT_REPLAY_ENDPOINT` — base URL of Studio.
- `AGENT_REPLAY_ENABLED` — set to `false`/`0`/`no`/`off` to disable recording
  without touching code.

```bash
AGENT_REPLAY_ENDPOINT=http://localhost:3001 node my-agent.js
AGENT_REPLAY_ENABLED=false node my-agent.js   # records nothing
```

`agent-replay init` scaffolds a `.env` with these (load it via
`node --env-file=.env my-agent.js`).

## Recording

### `replay.run(name, fn, options?)`

Opens a trace, runs your function, ends the trace on success, and marks it
failed if the function throws (then re-throws).

```ts
const result = await replay.run(
  "my-agent",
  async (trace) => {
    const span = trace.startSpan("retrieve", { kind: "retrieval" });
    const docs = await retrieve(query);
    span.end();

    trace.recordModelCall({
      provider: "openai",
      model: "gpt-4o",
      messages: [{ role: "user", content: query }],
      response: answer,
      inputTokens: 1200,
      outputTokens: 300,
    });

    return answer;
  },
  { input: query, metadata: { env: "dev" } },
);
```

### Manual lifecycle

```ts
const trace = replay.startTrace("my-agent", { input });
// ... record spans / model calls / tool calls / events ...
trace.end(output);   // or trace.fail(error)
```

### On a trace

- `trace.startSpan(name, { kind, parentId, attributes })` → `Span`
  (`span.end()`, `span.fail(err)`, `span.startChildSpan(...)`).
- `trace.recordModelCall({ provider, model, messages|prompt, response, inputTokens, outputTokens, spanId, startedAt?, endedAt?, durationMs? })`
  — cost is **estimated server-side** from the model + tokens. The timestamp
  fields are optional (added in `0.3.0`, backward compatible): `startedAt`
  defaults to now, and `durationMs` is derived from `startedAt`/`endedAt` when
  omitted.
- `trace.recordToolCall({ toolName, input, output, status, spanId, error })`.
- `trace.recordEvent(type, name, { input, output, error, metadata, parentId })`
  and `trace.log(name, data)`.
- `trace.recordError(error)`.

### Instrumentation helpers

Wrap async work so timing and errors are captured automatically:

```ts
import { withSpan, withModelCall, withToolCall } from "@agent-replay/sdk";

await withSpan(trace, "search", { kind: "tool" }, async (span) => { /* ... */ });

await withModelCall(trace, { provider: "openai", model: "gpt-4o" }, async () => ({
  response, inputTokens, outputTokens,
}));

await withToolCall(trace, { toolName: "web_search", input }, async () => results);
```

## Flushing — always call `shutdown()`

The HTTP collector **batches** events and flushes on an interval. Before your
process exits, flush the last batch:

```ts
await replay.shutdown(); // flushes and stops timers
// or, to flush without stopping: await replay.flush();
```

If you skip this in a short-lived script, the final events may never be sent.

## Collectors

- `HttpCollector` (default) — batches and POSTs to `${endpoint}/api/ingest`,
  with retries and `unref`'d timers so it never blocks process exit. Failures
  are swallowed (optionally surfaced via the `onError` callback) — recording
  should never crash your agent.
- `MemoryCollector` — stores everything in arrays; handy for tests and offline
  use. `createClient({ collector: new MemoryCollector() })`.

## Disabling in production/tests

```ts
const replay = createClient({ enabled: process.env.NODE_ENV !== "production" });
```

When disabled, the client API still works but records nothing and opens no
connections.
