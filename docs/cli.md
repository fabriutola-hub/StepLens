# CLI — `agent-replay`

The `agent-replay` command helps you run Studio, record demo/real traces, and
export them. Inside this repo, run it via `pnpm agent-replay <command>` (or
directly: `node packages/cli/dist/index.js <command>` after `pnpm build`).

```bash
pnpm agent-replay --help
pnpm agent-replay --version   # 0.3.0
```

Every command that talks to Studio takes `-e, --endpoint <url>` (default
`http://localhost:3000`).

## `demo`

Record three example agent traces and send them to Studio.

```bash
pnpm agent-replay demo
pnpm agent-replay demo -e http://localhost:3001
```

Requires Studio to be running — it checks first and, if Studio is unreachable,
tells you to start it and exits (it never fabricates data). Flushes via
`shutdown()` before exiting, so all three traces are persisted.

## `dev`

Start the Studio dev server and open the browser. **Requires the monorepo**
(it runs `pnpm --filter @agent-replay/studio dev`).

```bash
pnpm agent-replay dev            # http://localhost:3000
pnpm agent-replay dev -p 3001    # custom port
pnpm agent-replay dev --no-open  # don't open the browser
```

In most workflows you'll just use `pnpm dev` from the repo root.

## `record`

Run a command with the Agent Replay environment variables set
(`AGENT_REPLAY_ENDPOINT`, `AGENT_REPLAY_ENABLED=true`):

```bash
pnpm agent-replay record -- node my-agent.js
pnpm agent-replay record -e http://localhost:3001 -- python agent.py
```

> **This does not auto-instrument your program.** It only sets env vars. Your
> command must use `@agent-replay/sdk` (whose `createClient()` reads those vars)
> to actually record anything. Everything after `--` is the command to run.

## `new`

Generate a runnable example file. Templates: `simple`, `error`, `openai`,
`ollama`, `vercel-ai`, `anthropic`, `google`, `langchain`.

```bash
pnpm agent-replay new simple                 # → agent-replay-example.mjs
pnpm agent-replay new ollama --out demo.mjs
pnpm agent-replay new openai -e http://localhost:3001 --force
pnpm agent-replay new anthropic
```

Options: `--out <path>` (default `agent-replay-example.mjs`), `--endpoint <url>`,
`--force` (overwrite). It won't overwrite an existing file without `--force`.

- `simple`, `error`, and `ollama` need **no API key**.
- The integration templates **call a real API (may cost money)** — the command
  warns you and tells you what to install and which key to set:

| Template | Package(s) | API key |
| -------- | ---------- | ------- |
| `openai` | `npm i openai` | `OPENAI_API_KEY` |
| `vercel-ai` | `npm i ai @ai-sdk/openai` | `OPENAI_API_KEY` |
| `anthropic` | `npm i @anthropic-ai/sdk` | `ANTHROPIC_API_KEY` |
| `google` | `npm i @google/genai` | `GEMINI_API_KEY` |
| `langchain` | `npm i @langchain/openai @langchain/core` | `OPENAI_API_KEY` |

After generating, the command prints how to start Studio, run the file, and
where to view the trace. Run the generated file with `node <file>` (inside this
repo so `@agent-replay/sdk` resolves; elsewhere, `npm i @agent-replay/sdk`).

## `export`

Download a trace as JSON.

```bash
pnpm agent-replay export <traceId>
pnpm agent-replay export <traceId> -o ./my-exports
```

Writes `trace-<traceId>.json` into the output directory (default `./exports`).
Exits non-zero if the trace isn't found.

## `import`

Import a trace JSON (as produced by `export`) into Studio.

```bash
pnpm agent-replay import ./exports/trace-abc123.json
pnpm agent-replay import trace.json --replace
```

Options: `--endpoint <url>`, `--replace`. Preserves the trace id. Without
`--replace`, importing a trace that already exists fails (the server returns
`409`); re-run with `--replace` to overwrite it. Clear errors for missing files,
invalid JSON, and an unreachable Studio.

## `init`

Scaffold a `.env` with the variables the SDK reads:

```bash
pnpm agent-replay init
pnpm agent-replay init -e http://localhost:3001 --force
```

Creates a `.env` containing `AGENT_REPLAY_ENDPOINT` and `AGENT_REPLAY_ENABLED`.
Load it in your app with `node --env-file=.env my-agent.js`. Refuses to overwrite
an existing `.env` unless you pass `--force`.

## `doctor`

Check your environment: Node version, pnpm, SQLite (`better-sqlite3`), and
whether Studio is reachable.

```bash
pnpm agent-replay doctor
pnpm agent-replay doctor -e http://localhost:3001
```

## Notes

- The published `@agent-replay/cli` bundles the demo agents, so `demo` works
  without any extra install.
- The CLI has no hidden server of its own — Studio (`localhost:3000`) is the
  single source for the UI and API.
