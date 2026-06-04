# Migration to 0.8.0

StepLens `0.7.x` → `0.8.0` is largely backwards-compatible. The
breaking changes are listed below; everything else is additive.

## Highlights

- **Settings UI** — `/settings` now exists; it was previously only
  configurable via `localStorage`.
- **Live updates via SSE** — the `/api/events/stream` endpoint is
  stable and supported; clients can `EventSource` it.
- **Bulk operations** — `POST /api/traces/bulk` and
  `POST /api/export/bulk` are stable; the bulk ZIP is `application/zip`
  with a `_manifest.json` index.
- **Activity heat map** — `GET /api/activity` is stable; parameters
  (`from`, `to`, `tz`) are honored.

## Breaking changes

### `core` package: `TraceFilters.from` and `to` are now accepted by `/api/traces/stats`

Previously `/api/traces/stats` ignored `from` and `to`. It now applies
them. If your dashboard relied on a server-wide "all time" total, pass
explicitly wide bounds or use `/api/traces` for paging.

### `core` package: cost values are still `number` (USD), but the precision guard was tightened

`@agent-replay/core` no longer rounds to 4 decimals. If you were relying
on the rounding, multiply by `10000` and round yourself.

### `studio`: `traceStart` derivation in detail page moved out of effect

Internally, the detail page no longer calls `Date.now()` during render
when the trace is still running. Instead, it derives `traceEnd` from the
latest event/spans. The user-facing value is the same. If you were
visually inspecting the previous code path, see
[apps/studio/src/app/traces/[traceId]/page.tsx](../apps/studio/src/app/traces/[traceId]/page.tsx).

## New APIs

### `POST /api/traces/bulk`

Bulk operations over a list of trace ids.

```json
// Request
{ "op": "delete", "ids": ["abc", "def"] }
{ "op": "tag", "ids": ["abc", "def"], "tagOp": "add", "tag": "prod" }

// Response
{ "ok": true, "deleted": 2 }
{ "ok": true, "written": 2, "tag": "prod", "tagOp": "add" }
```

Limits: 1000 ids per request.

### `POST /api/export/bulk` (or `GET ?ids=a,b,c`)

Streams a `Content-Type: application/zip` archive with one
`traces/<id>.json` per id, plus a `_manifest.json` index.

```bash
curl -X POST http://localhost:3000/api/export/bulk \
  -H 'Content-Type: application/json' \
  -d '{"ids":["abc","def"]}' \
  -o traces.zip
```

### `GET /api/events/stream`

Server-Sent Events stream. `event: trace` payloads include `{id, name,
status, startedAt}`. `event: ping` every 1s as a keep-alive.

```js
const es = new EventSource("http://localhost:3000/api/events/stream");
es.addEventListener("trace", (e) => console.log(e.data));
```

### `GET /api/activity`

Per-day histogram of trace starts. Used by the Workbench heat map.

```
GET /api/activity?from=…&to=…&tz=-180
→ { from, to, fromBucket, toBucket, tz, counts: {"…": N} }
```

The `tz` parameter is **minutes east of UTC** (e.g. CEST = +120).

### `GET /api/health`

A health probe that returns 200 when SQLite is reachable and 503
otherwise. Suitable for Docker `HEALTHCHECK` and Kubernetes readiness
probes.

```
GET /api/health
→ { status: "ok", service: "steplens-studio", version, uptimeMs, startedAt, db: { connected, traceCount } }
```

## CLI additions

```
steplens stats [--since 24h] [--json]
steplens prune [--older-than 7d] [--status error] [--dry-run | --yes]
steplens watch [--format text|json]
```

`watch` consumes the new SSE endpoint.

## Settings

The Settings panel at `/settings` is the recommended way to configure:

- Theme (light / dark / system)
- Language (en / es / system)
- Default page size, sort, poll interval
- Live updates (SSE) on/off
- Daily and monthly cost budgets
- Compact rows (denser table typography)

All settings are stored in `localStorage` under the versioned key
`steplens.settings.v1`. If you need to reset, run
`localStorage.removeItem("steplens.settings.v1")` in the browser console
or click "Reset to defaults" in the panel.

## Removed/deprecated

- **None.** All 0.7.x endpoints and SDK APIs continue to work.
