# @agent-replay/cli

The `agent-replay` command for [StepLens](https://github.com/fabriutola-hub/StepLens) —
a local-first trace inspector for AI agents.

```bash
agent-replay --help
```

| Command | What it does |
| ------- | ------------ |
| `demo` | Record three example traces and send them to Studio |
| `dev` | Start the Studio dev server (requires the monorepo) |
| `record -- <cmd>` | Run a command with Agent Replay env vars set (no auto-instrumentation) |
| `export <traceId>` | Download a trace as JSON |
| `init` | Scaffold a `.env` with the variables the SDK reads |
| `doctor` | Check your environment and Studio connectivity |

All commands that talk to Studio accept `-e, --endpoint <url>` (default
`http://localhost:3000`).

Full docs: [`docs/cli.md`](https://github.com/fabriutola-hub/StepLens/blob/main/docs/cli.md).

MIT licensed.
