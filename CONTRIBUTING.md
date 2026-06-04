# Contributing to StepLens

Thanks for your interest in contributing! StepLens is open source and
welcomes issues, fixes, features, and docs improvements from anyone.

This guide explains how to set up the dev environment, what we expect from
PRs, and how the project is organised.

## Code of conduct

By participating you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md). Be kind.

## Getting help & talking things through

- **Bug?** Open an [issue](https://github.com/fabriutola-hub/StepLens/issues/new/choose).
- **Question, idea, show-and-tell?** Use [GitHub Discussions](https://github.com/fabriutola-hub/StepLens/discussions).
- **Security?** See [SECURITY.md](SECURITY.md) — don't open a public issue.

## Prerequisites

- **Node.js** ≥ 18 (CI runs on 20 and 22; we ship the pinned version in
  [`.nvmrc`](.nvmrc) — `nvm use` will pick it up)
- **pnpm** 11 (`corepack enable` reads the version pinned in
  `package.json#packageManager` and installs it for you)
- **Git** with line-ending settings that respect [`.editorconfig`](.editorconfig)

## One-time setup

```bash
git clone https://github.com/fabriutola-hub/StepLens.git
cd StepLens
corepack enable
pnpm install
```

Or use the devcontainer:

```bash
# In VS Code: "Reopen in Container" — installs everything for you.
```

Or with Docker Compose for the dev stack:

```bash
docker compose -f docker-compose.dev.yml up
```

## The everyday dev loop

```bash
pnpm dev            # Studio on http://localhost:3000 (hot reload)
pnpm typecheck      # tsc --noEmit across every package
pnpm test           # vitest run across every package
pnpm lint           # eslint (Studio enforces it under Next 16 strict)
pnpm build          # cold build everything
```

In a second terminal, record some sample traces against your local Studio:

```bash
pnpm steplens demo
```

## Repository layout

| Path                | Package                  | What it is |
| ------------------- | ------------------------ | ---------- |
| `packages/core`     | `@agent-replay/core`     | Shared types, Zod schemas, cost lookup |
| `packages/sdk`      | `@agent-replay/sdk`      | Recording client + LLM integrations |
| `packages/cli`      | `@agent-replay/cli`      | `steplens` / `agent-replay` binaries |
| `packages/otel`     | `@agent-replay/otel`     | OpenTelemetry bridge |
| `packages/steplens` | `steplens`               | npm meta-package (`npx steplens dev`) |
| `packages/examples` | `@agent-replay/examples` | Demo agents (private; bundled into the CLI) |
| `apps/studio`       | `@agent-replay/studio`   | Next.js UI + ingest/query API |

Build order is fixed by `turbo.json`: `core → sdk → cli/otel/studio`. You
rarely need to think about it — `pnpm build` handles dependency order.

See [`docs/architecture.md`](docs/architecture.md) for how data flows.

## Workflow

1. **Open an issue first** for non-trivial changes (anything > ~50 LOC, any
   new dependency, any breaking API change). This saves you from writing
   code that won't get merged.
2. Fork → branch → work → PR. Branch names: `feat/<slug>`, `fix/<slug>`,
   `docs/<slug>`, `chore/<slug>`.
3. Keep PRs **focused and small**. One PR = one concern. Big PRs are fine
   if they're cohesive (e.g. a whole new feature), but split out unrelated
   refactors.
4. CI must be green before review.

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

<body>

<footer>
```

Types we use: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`,
`build`, `ci`. Scopes match package names (`sdk`, `cli`, `studio`, `core`,
`otel`) or cross-cutting areas (`deps`, `release`, `docs`).

The footer can include `Co-Authored-By:`, `Closes #N`, or `BREAKING CHANGE:`.

## Coding notes

- **Match the surrounding code.** Comment density, naming, idioms — read
  the file before you change it.
- **Studio is lint-clean** under Next 16 / React 19 strict rules. No `any`
  in route handlers; no setState-in-effect; no `Date.now()` during render.
  See `apps/studio/eslint.config.mjs` for the active rules.
- **Costs are USD decimal dollars** (`0.0013`), never cents.
- **"Replay" means step-by-step playback**, not deterministic re-execution.
- Public APIs (SDK, core types) should be documented with JSDoc comments and
  covered by tests.
- Studio runs in Node (server) and the browser (client) — keep `node:*`
  imports out of `'use client'` files.

## Tests

- We use [Vitest](https://vitest.dev) everywhere.
- Each package has its own `test/` directory.
- For Studio route handlers, instantiate the in-memory DB before importing
  the handler — see `apps/studio/test/api/routes.test.ts` for the pattern.
- New features must come with tests where practical. Bug fixes must come
  with a regression test.

## Before opening a PR — checklist

- [ ] `pnpm lint` is green
- [ ] `pnpm typecheck` is green
- [ ] `pnpm test` is green
- [ ] You added tests for the new behavior or regression
- [ ] You updated `CHANGELOG.md` under `## [Unreleased]` if user-facing
- [ ] You updated relevant docs (`README.md`, `docs/`) if behavior changed
- [ ] Your branch is rebased on top of latest `main`

## Reviews

A maintainer will usually respond within a few days. Feedback is meant to
make the change better, not a personal critique — and we appreciate the
same energy back.

## After merge

Your contribution will be credited in the next release notes
(`CHANGELOG.md`). Releases happen on no fixed cadence — usually when
several meaningful changes have accumulated.

## License

By contributing you agree your work will be released under the
[MIT License](LICENSE), the same license as the rest of the project.
