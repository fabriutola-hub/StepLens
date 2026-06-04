# Troubleshooting

Common problems and their fixes.

## Installation

### `better-sqlite3` fails to install

This is the most common install issue. Possible causes:

**Prebuilt binary not available for your platform.**
```bash
# Force a from-source build:
npm rebuild better-sqlite3 --build-from-source
# or
pnpm rebuild better-sqlite3
```

**Missing build toolchain (macOS):**
```bash
xcode-select --install
```

**Missing build toolchain (Debian/Ubuntu):**
```bash
sudo apt-get install -y python3 build-essential
```

**Apple Silicon prebuilt mismatch:**
```bash
# Run with the matching arch:
arch -arm64 npm install
# or rebuild:
npm rebuild better-sqlite3 --build-from-source
```

### `corepack enable` doesn't pick up pnpm

```bash
corepack prepare pnpm@11.5.1 --activate
```

### `node-gyp` errors on Windows

Install Windows Build Tools or Visual Studio with the "Desktop development
with C++" workload. Then:
```bash
pnpm rebuild better-sqlite3
```

## Runtime

### Studio says "no traces recorded yet" but I'm sending them

1. Confirm Studio is running and reachable:
   ```bash
   curl http://localhost:3000/api/health
   ```
   A `200` response means Studio is healthy.

2. Confirm the SDK points at the same URL. `AGENT_REPLAY_ENDPOINT` must
   match the Studio's listen address.

3. Check the browser Network tab. `POST /api/events` should return
   `{"ok":true, "inserted": N}`.

4. Check Studio's terminal output for ingest errors. SQLite UNIQUE
   violations and FK violations are the most common failures (e.g. an
   `event` for a `traceId` that doesn't exist yet).

### "EADDRINUSE" — port 3000 is taken

Either stop the process using port 3000, or pick another:
```bash
npx steplens dev --port 3010
# or
AGENT_REPLAY_ENDPOINT=http://localhost:3010 npx steplens demo
```

### Studio UI loads but is empty (no traces)

The SQLite file at `~/.agent-replay/studio.db` may be:
- New (no traces yet — run `npx steplens demo`)
- Locked (close any other process opening it, including `sqlite3` CLI)
- Corrupt (move it aside, restart Studio — you'll lose the data, but a
  new DB will be created)

### Trace shows `error` status but no error message

The `error` field on a model call or tool call is what we display. If a
status was set via `trace.end("error")` without an attached error, the
status appears without a message. Pass the error to the trace end:
```ts
await replay.record("name", async (run) => {
  // …
  if (somethingFailed) run.fail(error);
});
```

### Cost shows as `$0.0000` for all traces

The model name isn't in `@agent-replay/core`'s pricing table. Open an
issue with the model name and we can add it. Alternatively, cost is
optional — your trace still records everything else.

### Trace list is slow with >5000 traces

The list paginates (default 25/page) so it should still be snappy. The
stats strip and activity heat map are server-side aggregated and survive
~100k traces without issue. If you're seeing slowness, check:
- The SQLite `WAL` mode is on (it is by default; if you disabled it,
  reads will block writes).
- `pnpm dev` is not running in production (it auto-recompiles on every
  change).
- You don't have a saved view with an absurdly long regex query (LIKE
  queries on `name` are O(n) over the table; consider indexing).

## Docker

### `docker run` exits immediately

Check the logs:
```bash
docker logs <container-id>
```

The most common cause is a prebuilt mismatch: a Linux image run on a
different architecture. Verify with `docker inspect` or use
`--platform linux/amd64`.

### The Docker container can write to `/data` but the host volume is empty

Volume mount permissions. The container runs as `node` (uid 1000); on
Linux, the host directory needs to be readable by uid 1000:
```bash
sudo chown -R 1000:1000 ./steplens-data
```

### "SQLITE_BUSY" errors inside the container

WAL mode is on by default, which keeps reads non-blocking. If you see
this, the most likely cause is multiple processes opening the same file.
The container has a single Next.js process, so make sure you didn't
shell in and start a second one.

## CI

### `pnpm typecheck` fails on the Studio package with "Cannot find module './routes.js'"

This is a known issue with Next 16's typed-routes generation. Run
`pnpm build` first so the `.next/types/` directory is created, then
`pnpm typecheck`.

### `pnpm lint` complains about React 19 hooks rules

We pin ESLint to the rules shipped with `eslint-config-next` 16.2.7. If
you see a new rule, update the lockfile and run `pnpm install`.

## GitHub Actions

### CodeQL workflow fails on a new secret detector

False positives are common. Add a `paths-ignore` entry in
`.github/workflows/codeql.yml` for the path, or use
`# codeql[py/clear-text-logging-sink]` suppression comments.

### Dependabot opens a PR with a license-violating dependency

We block GPL/AGPL by default in
`.github/workflows/dependency-review.yml`. If the dependency is truly
needed, you can override per-PR with a `dependabot:` trailer.

## Studio UI

### The keyboard shortcuts don't work

Press `?` to see which shortcuts the current page exposes. `/` is the
one shortcut that works inside text inputs. All others are suppressed
while typing in form fields.

### Dark mode doesn't persist

Check the browser console for `localStorage` errors. Private/incognito
mode disables localStorage; the theme still works for the session.

### Bulk operations hang with no feedback

Check Studio's terminal for SQL errors. The bulk endpoints use
transactions, so a single bad trace can fail the whole operation.
Inspect the response — `{ error: "Internal server error", details: "…" }`
will tell you which row.

### "Settings" link missing

The Settings page was added in 0.8.0. If you don't see it, you're on an
older version. Run `npx steplens --version`.

## CLI

### `steplens stats` returns 0 traces but Studio shows them

Stats uses the same `GET /api/traces/stats` endpoint as the Workbench.
Confirm `AGENT_REPLAY_ENDPOINT` matches the URL Studio is actually
serving. Test with `curl $AGENT_REPLAY_ENDPOINT/api/traces/stats | jq`.

### `steplens watch` disconnects after a minute

Some proxies and reverse-proxies buffer SSE streams and reset the
connection after their idle timeout. Set the response header
`X-Accel-Buffering: no` (already set by Studio) and the proxy's idle
timeout to at least 5 minutes.

### `steplens prune` doesn't delete anything

By default, `prune` requires `--yes` to actually delete (it's
destructive). Run with `--dry-run` first to preview.

## Still stuck?

- [GitHub Discussions](https://github.com/fabriutola-hub/StepLens/discussions)
- [Discord](https://github.com/fabriutola-hub/StepLens) (link in README)
- [Issue tracker](https://github.com/fabriutola-hub/StepLens/issues)
