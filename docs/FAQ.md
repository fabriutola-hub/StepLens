# FAQ

Frequently asked questions about StepLens.

## General

### What is StepLens?

A **local-first trace inspector for AI agents**. It records what your agent
did (spans, model calls, tool calls, errors, tokens, estimated cost) and
lets you inspect runs in a local Studio UI as a timeline, graph, event log,
or step-by-step replay.

### Is it self-hosted? Cloud? SaaS?

All local. No accounts, no hosted service. Studio runs on your machine and
stores traces in a local SQLite file at `~/.agent-replay/studio.db`.

### Why "local-first"?

Because that's the design that maximises trust and minimises friction.
Trace data frequently includes sensitive prompt content, model responses,
and tool inputs — sending that to a hosted service without explicit consent
is a non-starter for many teams. StepLens works on your laptop, in a
container, or in CI.

### What's the difference between "trace", "span", "model call", and "tool call"?

- **trace** — the whole agent run, from start to end
- **span** — a unit of work within a trace (`agent`, `model`, `tool`,
  `retrieval`, `parser`, `custom`)
- **model call** — a single LLM API invocation (provider, model, messages,
  response, tokens, latency, cost)
- **tool call** — a single tool execution (name, input, output, status, latency)

A trace has many spans. A span can be a model call, a tool call, or a
piece of code. Both model calls and tool calls attach to the trace directly
even when not nested under a span, so you can analyse them independently.

### How much does it cost?

StepLens itself is free and open source (MIT). The **estimated cost** you
see for a model call is what the underlying LLM API cost in USD, based on a
static pricing table in `@agent-replay/core`. Treat it as observability
context, not billing data.

## Setup

### What Node version do I need?

Node.js ≥ 18 is the published requirement. We test on Node 20 and 22 in
CI. We ship an `.nvmrc` pinned to 22.

### Do I need to install anything else?

`pnpm` (via `corepack enable`), and a `better-sqlite3` prebuilt binary
(Node ships with a C compiler and `node-gyp` so a from-source build works
if no prebuilt is available for your platform).

### I'm behind a corporate proxy. Will Studio work?

Studio's SDK + Studio HTTP server should work as long as outbound HTTPS to
npm and the LLM provider is allowed. The Studio UI itself uses no external
assets (no CDN fonts, no Google Analytics).

### Why is my Docker image 1.5 GB?

Studio ships a full Next.js + node_modules tree, plus native `better-sqlite3`
binaries. The official image uses `node:22-bookworm-slim` to keep it as
small as practical. If you need smaller, build with `--target runtime` and
trim the build dependencies, or use a multi-stage build that mounts your
own pre-built Studio.

## Recording

### Why is my trace missing model calls?

The most common cause is that the model call happened *outside* a
`replay.record()` block. The recording client only captures work that
happens inside its execution context. Move the call inside the block, or
wrap the client with `wrapOpenAI(...)` etc. for automatic capture.

### My trace shows a model call but zero tokens

Some LLM providers (especially smaller or self-hosted ones) don't return
token usage in the response. StepLens stores whatever the provider
returns; if the API doesn't include it, we can't show it. Some wrappers
(`wrapOpenAI`, `wrapVercelAI`) let you set `tokenUsage` manually if you
compute it yourself.

### Cost looks wrong

Cost is calculated from a static pricing table in `@agent-replay/core`. If
your provider's price changed, or you're using a model we don't list
(yet), the cost will be missing. Open an issue with the model name and
pricing and we'll add it.

## Studio

### Why are old traces missing?

Studio's SQLite database lives at `~/.agent-replay/studio.db`. If that file
was deleted, the data is gone. We don't ship a "remote backup" — if you
need retention, point a backup agent at the SQLite file directly.

### Can multiple people share one Studio?

Yes — point all the SDKs at the same `http://your-host:3000`. The only
caveats: this is unauthenticated, so don't expose it to an untrusted
network without putting your own auth in front.

### The "Live" indicator is blinking every 3 seconds — can it be faster?

Yes, in two places:
- The Workbench polls every 3s by default. Change it in `/settings`
  (Appearance → Workbench → Poll interval) or via `localStorage`.
- Enable **Live updates (SSE)** in settings to get push-based updates
  instead of polling.

### How do I compare two runs?

Select two rows in the workbench (click the checkboxes), then click
**Compare**. You can also navigate directly to
`/compare?left=<id>&right=<id>`.

### My saved view disappeared

Saved views are stored in the same SQLite file. If the file is gone, so
are the views. There's no remote sync.

## API

### Is the API authenticated?

No. Studio is designed to run locally and trust every request as the
caller. If you expose it beyond localhost, you must add your own auth
(reverse proxy with `oauth2-proxy` is the simplest option).

### Can I send my own non-SDK data?

Yes. `POST /api/events` accepts the same batch shape the SDK sends. See
[api-reference.md](api-reference.md).

### Can I extend the schema?

Not in-place. SQLite tables are created on first connect; adding a column
requires writing a migration in `apps/studio/src/db/connection.ts` and
adding the corresponding Drizzle field in `db/schema.ts`.

## CLI

### `steplens demo` isn't working

Make sure Studio is running first (`npx steplens dev`). The demo
subprocesses POST to `http://localhost:3000` by default; if Studio is on a
different port, pass `--endpoint http://localhost:3001`.

### `steplens watch` keeps showing `ping` events

The SSE endpoint emits a heartbeat every second. The `watch` command
filters those out and only prints `trace` events. If you see anything
else, open an issue with the raw event payload.

### Can I install the CLI globally?

```bash
npm i -g steplens
steplens --version
```

The published package ships both the `steplens` and `agent-replay`
binaries for backward compatibility.

## Contributing

### Where do I start?

See [CONTRIBUTING.md](../CONTRIBUTING.md) and pick an issue tagged
`good first issue` or `help wanted`. The codebase is small enough to
navigate in an afternoon.

### I found a security issue. How do I report it?

See [SECURITY.md](../SECURITY.md) — please report privately, not via
a public issue.
