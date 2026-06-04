# Contributing to StepLens

Thanks for your interest in contributing! This is an early, local-first project
and we welcome issues, fixes, and focused improvements.

## Prerequisites

- **Node.js** ≥ 18 (CI runs on 20 and 22)
- **pnpm** 11 (`corepack enable` will pick up the version pinned in `package.json`)

## Getting started

```bash
pnpm install
pnpm build        # build all packages (core → sdk → cli → studio)
pnpm test         # run the test suites
pnpm typecheck    # type-check every package
```

To run Studio locally:

```bash
pnpm dev          # http://localhost:3000
```

And record some sample traces (in a second terminal, with Studio running):

```bash
pnpm agent-replay demo
```

## Repository layout

| Path                | Package                  | What it is |
| ------------------- | ------------------------ | ---------- |
| `packages/core`     | `@agent-replay/core`     | Types, Zod schemas, cost lookup |
| `packages/sdk`      | `@agent-replay/sdk`      | Recording client (`createClient`, collectors) |
| `packages/cli`      | `@agent-replay/cli`      | `agent-replay` CLI |
| `packages/examples` | `@agent-replay/examples` | Demo agents (private; bundled into the CLI) |
| `apps/studio`       | `@agent-replay/studio`   | Next.js UI + ingest/query API |

See [`docs/architecture.md`](docs/architecture.md) for how data flows between them.

## Before you open a PR

- `pnpm typecheck`, `pnpm test`, and `pnpm build` should all pass.
- Keep changes focused; match the style of the surrounding code.
- If you change behavior, update the relevant docs in `docs/` and `CHANGELOG.md`.
- New code paths should come with a test where practical.

## Coding notes

- The SDK and core are published packages — avoid Node-only APIs in code paths
  that might run in other runtimes, and keep the public API documented.
- Costs are always **USD decimal dollars** (e.g. `0.0013`), never cents. See
  [`docs/architecture.md`](docs/architecture.md#costs).
- "Replay" means step-by-step playback of a recorded trace, not deterministic
  re-execution. Don't describe it as re-running the agent.

## Before publishing (maintainers)

The published package metadata points to `fabriutola-hub/StepLens`. Confirm the
repository URL is still correct before running `pnpm publish`. See
`CHANGELOG.md` for the release checklist.
