# Quickstart

Goal: from a clean clone to seeing your first trace in Studio.

## 1. Prerequisites

- **Node.js ≥ 18** (`node -v`)
- **pnpm 11** — run `corepack enable` once; it picks up the version pinned in
  the root `package.json`.

You can sanity-check your machine at any point with:

```bash
pnpm agent-replay doctor
```

## 2. Install and build

```bash
pnpm install
pnpm build
```

`pnpm build` builds the packages in dependency order (`core` → `sdk` → `cli` →
`studio`). The CLI binary lands at `packages/cli/dist/index.js`.

## 3. Start Studio

```bash
pnpm dev
```

This starts the Next.js app at **http://localhost:3000**. Leave it running.
Studio serves both the UI and the ingest/query API on this single port — the SDK
sends traces to `http://localhost:3000/api/ingest`.

The first time it runs, Studio creates a local SQLite database at
`~/.agent-replay/studio.db`.

## 4. Record traces

### Option A — the bundled demo

In a second terminal (with Studio still running):

```bash
pnpm agent-replay demo
```

This records three example agents (a research assistant, a multi-tool agent, and
a failing agent). Back in the browser, the trace list refreshes automatically
and the three traces appear.

> `demo` requires Studio to be running and does **not** fabricate data — if
> Studio is unreachable it tells you to start it and exits.

### Option B — the minimal example

```bash
node ejemplo-simple.mjs
```

Records a single **"Mi agente simple"** trace using the SDK directly. Read the
file — it's the smallest end-to-end example.

## 5. Explore a trace

Click any trace to open the detail page:

- **Timeline** — every span/event/model/tool on a time axis, with **replay**
  controls (play, step, seek). Stepping highlights the current event, dims
  not-yet-reached ones, and the inspector follows along.
- **Graph** — the same data as a DAG (spans, model calls, tool calls).
- **Events** — a flat chronological list.
- **Data** — the trace's input/output/metadata.
- **Export JSON** — download the full trace from the top-right.

## 6. Record from your own agent

See [`sdk.md`](sdk.md). The short version:

```ts
import { createClient } from "@agent-replay/sdk";

const replay = createClient(); // → http://localhost:3000
await replay.run("my-agent", async (trace) => {
  // ... instrument spans, model calls, tool calls ...
});
await replay.shutdown();
```

## Troubleshooting

- **"Studio is not reachable"** — start `pnpm dev` first.
- **Port 3000 busy** — run Studio elsewhere
  (`pnpm --filter @agent-replay/studio dev -- -p 3001`) and pass
  `-e http://localhost:3001` to CLI commands, or set
  `AGENT_REPLAY_ENDPOINT=http://localhost:3001` for the SDK.
- **No traces show up** — confirm your client targets the same endpoint and that
  you call `await replay.shutdown()` before the process exits.
- **Start fresh** — delete `~/.agent-replay/studio.db` (plus `-wal`/`-shm`).
