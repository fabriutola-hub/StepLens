# API Reference

The complete HTTP API exposed by StepLens Studio. All endpoints are
`application/json` unless noted otherwise. Authentication is **not**
required (Studio is local-first; if you expose it, put your own auth
in front).

Base URL: `http://localhost:3000` by default. The Studio process binds
to `127.0.0.1` unless you pass `--host 0.0.0.0`.

## Conventions

- All timestamps are **epoch milliseconds** (UTC).
- All numeric values that are "dollars" are **USD decimal dollars** (e.g.
  `0.0013` for one-tenth of a cent), never cents.
- `404` means "the row does not exist" — including for missing traces,
  missing annotations, and missing saved views. The body is
  `{ "error": "<message>" }`.
- `400` means "your request is malformed" — body
  `{ "error": "<message>", "details"?: ZodIssues }`.
- `500` means "Studio itself failed" — body
  `{ "error": "Internal server error", "details": "<message>" }`.
- `207 Multi-Status` is used by `/api/events` when some rows failed
  validation but others succeeded.

---

## GET /api/health

Lightweight probe. Returns 200 with version + DB connectivity, 503 when
the database is unreachable.

**Response 200:**
```json
{
  "status": "ok",
  "service": "steplens-studio",
  "version": "0.8.0",
  "uptimeMs": 12345,
  "startedAt": 1717549200000,
  "db": { "connected": true, "traceCount": 42 }
}
```

**Response 503:**
```json
{
  "status": "down",
  "db": { "connected": false, "error": "SQLITE_BUSY" }
}
```

Always `Cache-Control: no-store`.

---

## GET /api/traces

List traces with the same filter, sort, and paging options the Workbench
exposes.

**Query parameters** (all optional):

| Name | Type | Description |
| --- | --- | --- |
| `q` | string | Substring match on trace name or id |
| `status` | enum | `running` \| `success` \| `error` \| `cancelled` |
| `from` | ms | `startedAt >= from` |
| `to` | ms | `startedAt <= to` |
| `model` | string | Only traces with a model call using this model |
| `tool` | string | Only traces with a tool call using this tool name |
| `hasError` | bool | Only traces that errored (string `"true"` or `"1"`) |
| `favorite` | bool | Only favorited traces |
| `tag` | string | Only traces with this tag |
| `sort` | enum | `startedAt` \| `durationMs` \| `name` \| `status` |
| `order` | enum | `asc` \| `desc` |
| `limit` | int | Default 25, max 200 |
| `offset` | int | Default 0 |

**Response 200:**
```json
{
  "traces": [
    {
      "id": "trc_abc",
      "name": "Docs Agent",
      "status": "success",
      "startedAt": 1717549200000,
      "endedAt": 1717549204000,
      "durationMs": 4000,
      "estimatedCostUsd": 0.0123,
      "favorite": false,
      "note": null,
      "tags": ["prod"]
    }
  ],
  "total": 1
}
```

---

## GET /api/traces/stats

Same filter parameters as `/api/traces` (minus `limit`, `offset`,
`sort`, `order`). Returns aggregate stats over the filtered set.

**Response 200:**
```json
{
  "total": 100,
  "statusCounts": { "success": 92, "error": 6, "running": 2 },
  "totalDurationMs": 480000,
  "avgDurationMs": 4800,
  "p95DurationMs": 12000,
  "totalTokens": 1280000,
  "estimatedCostUsd": 1.234,
  "modelCounts": { "gpt-4o": 50, "claude-sonnet": 30 },
  "toolCounts": { "web_search": 80, "read_file": 40 },
  "errorCount": 6,
  "errorRate": 0.06
}
```

---

## GET /api/traces/{id}

Full detail for a single trace.

**Response 200:**
```json
{
  "trace": { "id": "trc_abc", "name": "Docs Agent", "status": "success", "startedAt": …, "endedAt": …, "durationMs": …, "input": …, "output": …, "metadata": … },
  "events": [{ "id": "…", "traceId": "trc_abc", "type": "log", "name": "…", "timestamp": …, "durationMs": …, "input": …, "output": …, "error": null, "metadata": {} }],
  "spans": [{ "id": "…", "traceId": "…", "parentId": null, "name": "agent", "kind": "agent", "status": "success", "startedAt": …, "endedAt": …, "durationMs": …, "attributes": {}, "children": [] }],
  "modelCalls": [{ "id": "…", "traceId": "…", "spanId": "…", "provider": "openai", "model": "gpt-4o", "prompt": "…", "messages": […], "response": "…", "inputTokens": …, "outputTokens": …, "totalTokens": …, "estimatedCostUsd": 0.0123, "startedAt": …, "endedAt": …, "durationMs": …, "metadata": {} }],
  "toolCalls": [{ "id": "…", "traceId": "…", "spanId": "…", "toolName": "web_search", "input": {…}, "output": {…}, "status": "success", "startedAt": …, "endedAt": …, "durationMs": …, "error": null, "metadata": {} }],
  "annotation": { "traceId": "trc_abc", "favorite": false, "note": null, "tags": [], "updatedAt": … }
}
```

**Response 404:** `{ "error": "Trace not found" }`

---

## DELETE /api/traces/{id}

Delete a trace and (via `ON DELETE CASCADE`) its events, spans, model
calls, and tool calls.

**Response 200:** `{ "ok": true, "traceId": "…" }`
**Response 404:** `{ "error": "Trace not found" }`

---

## POST /api/traces/bulk

Bulk operations on up to 1000 traces.

**Request — delete:**
```json
{ "op": "delete", "ids": ["trc_abc", "trc_def"] }
```

**Request — tag:**
```json
{ "op": "tag", "ids": ["trc_abc"], "tagOp": "add", "tag": "prod" }
```

`tagOp` is `"add"` or `"remove"`. `tag` is the tag string.

**Response 200 (delete):** `{ "ok": true, "deleted": 2 }`
**Response 200 (tag):** `{ "ok": true, "written": 2, "tag": "prod", "tagOp": "add" }`
**Response 400:** `{ "error": "ids must be a non-empty array of strings" }`

---

## GET /api/traces/{id}/annotation

Get the local annotation (favorite / note / tags) for a trace. Returns
`{ annotation: null }` if none is set.

**Response 200:** `{ "annotation": { "traceId": "trc_abc", "favorite": true, "note": "…", "tags": ["prod"], "updatedAt": 1717549200000 } | null }`

---

## PUT /api/traces/{id}/annotation

Upsert the local annotation. `AnnotationInput` is a partial — fields
you omit are left unchanged.

**Request:**
```json
{ "favorite": true, "note": "Released to prod on Friday", "tags": ["prod", "shipped"] }
```

**Response 200:** `{ "annotation": { … } }`
**Response 404:** `{ "error": "Trace not found" }` (only when the trace id doesn't exist)
**Response 400:** `{ "error": "favorite must be a boolean" }` etc.

---

## GET /api/compare?left={id}&right={id}

Side-by-side summary + deltas for two traces.

**Response 200:**
```json
{
  "left": { "trace": {…}, "durationMs": 4000, "estimatedCostUsd": 0.0123, "totalTokens": 1200, "modelCallCount": 2, "toolCallCount": 3, "spanCount": 4, "eventCount": 30, "errorCount": 0, "models": {…}, "tools": {…} },
  "right": { … },
  "deltas": {
    "durationMs": 100,
    "estimatedCostUsd": 0.001,
    "totalTokens": 50,
    "errorCount": 1,
    "models": [{ "key": "gpt-4o", "left": 2, "right": 1, "delta": -1 }],
    "tools":  [{ … }],
    "spans":  [{ "key": "agent:planner", "kind": "agent", "name": "planner", "leftDurationMs": 120, "rightDurationMs": 240, "deltaMs": 120 }]
  }
}
```

**Response 400:** `{ "error": "Both 'left' and 'right' trace ids are required" }`
**Response 404:** `{ "error": "One or both traces were not found" }`

---

## GET /api/views / POST /api/views

List and create saved views. Saved views are named, reusable filter sets
that show up in the Workbench.

**GET** returns `{ views: [...] }`.
**POST** accepts `{ name: "Production errors", filters: { status: "error", hasError: true } }` and returns the created view.

---

## PUT /api/views/{id} / DELETE /api/views/{id}

Update (rename, replace filters) or delete a saved view. PUT body is the
same shape as POST.

---

## GET /api/activity?from={ms}&to={ms}&tz={minEastOfUtc}

Per-day histogram of trace starts, used by the heat map.

**Response 200:**
```json
{
  "from": 1717549200000,
  "to": 1718144000000,
  "fromBucket": 19861100,
  "toBucket": 19861200,
  "tz": 0,
  "counts": { "19861105": 3, "19861106": 7 }
}
```

`counts` is sparse — missing keys mean zero traces that day. The bucket
key is `floor((startedAt + tzMs) / 86_400_000)`.

---

## GET /api/events/stream

Server-Sent Events stream of trace activity. `text/event-stream`.

**Events emitted:**

| Event | Data | When |
| --- | --- | --- |
| `hello` | `{ "now": <ms> }` | On connection |
| `trace` | `{ "id", "name", "status", "startedAt" }` | Each new trace seen since the previous ping |
| `ping` | `{}` | Every 1s as a keep-alive |

The connection stays open until the client disconnects. There is no
auth; the endpoint is local-only.

---

## POST /api/events / POST /api/ingest

Ingest a batch of events. Body shape:

```json
{
  "events": [
    { "kind": "trace", "data": { "id": "trc_abc", "name": "Docs Agent", "status": "running", "startedAt": 1717549200000 } },
    { "kind": "span",  "data": { "id": "spn_1", "traceId": "trc_abc", "name": "search", "kind": "tool", "status": "running", "startedAt": 1717549201000 } },
    { "kind": "model_call", "data": { "id": "mc_1", "traceId": "trc_abc", "provider": "openai", "model": "gpt-4o", "startedAt": 1717549202000, "inputTokens": 100, "outputTokens": 50, "durationMs": 800 } },
    { "kind": "tool_call", "data": { "id": "tc_1", "traceId": "trc_abc", "toolName": "web_search", "input": {…}, "output": {…}, "status": "success", "startedAt": 1717549203000, "durationMs": 250 } },
    { "kind": "span.update", "data": { "id": "spn_1", "status": "success", "endedAt": 1717549204000, "durationMs": 3000 } },
    { "kind": "trace.update", "data": { "id": "trc_abc", "status": "success", "endedAt": 1717549205000, "durationMs": 5000 } }
  ]
}
```

**Response 200:** `{ "ok": true, "inserted": N, "updated": N, "errors"?: [...], "total": N }`
**Response 207 (Multi-Status):** some events failed; body lists both
`accepted` and `errors`.
**Response 400:** `{ "error": "Invalid payload", "details": [ZodIssue, ...] }`

---

## POST /api/export/bulk

Bulk export as a ZIP archive. Accepts either:

- `POST` with `{ ids: ["a", "b"] }` JSON body, or
- `GET /api/export/bulk?ids=a,b` for browser-friendly downloads

**Response 200:** `Content-Type: application/zip` with `traces/<id>.json`
files plus a top-level `_manifest.json` that lists requested / exported /
missing ids.

**Response 400:** `{ "error": "ids must be a non-empty array" }`

---

## POST /api/import

Import a previously exported trace JSON bundle.

**Request body:** a `traceExportSchema`-shaped object (see
`@agent-replay/core` for the canonical type).

**Response 200:** `{ "ok": true, "traceId": "trc_abc", "replaced": false }`
**Response 409:** `{ "error": "Trace already exists", "traceId": "trc_abc", "hint": "Re-send with ?replace=true to overwrite it." }`

---

## GET /api/export/{id}

Download a single trace as a JSON bundle. Same shape as
`/api/import`'s request body.

**Response 200:** `Content-Type: application/json`,
`Content-Disposition: attachment; filename="trace-<id>.json"`.

---

## Limits

- **`limit`** on `/api/traces`: max 200.
- **Bulk endpoints**: max 1000 ids per request.
- **SSE**: no hard cap; one connection per browser tab is recommended.
