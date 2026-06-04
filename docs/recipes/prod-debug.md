# Recipe: Debug a stuck prod agent

Your production agent hangs. You have a process that has the agent
running and you can shell in. Here's how to use StepLens to inspect the
last 24h of activity.

## 1. Enable tracing on the agent process

If the agent process is already running with the SDK, you're set —
records are already streaming. If not, the fastest path is:

```bash
export AGENT_REPLAY_ENABLED=true
export AGENT_REPLAY_ENDPOINT=http://studio-host:3000
# start the agent as usual
./start-agent.sh
```

The `record` CLI also works as a wrapper if the process reads env vars:

```bash
npx steplens record -- ./start-agent.sh
```

## 2. Open Studio in your browser

```
http://studio-host:3000
```

Use the **Search** box to filter by name (most agents name their runs
sensibly), then **Status = error** + **Errors** facet to narrow.

## 3. Open the most recent failing trace

Click the row. Studio's **Summary** tab shows a critical shortlist
at the top — the slowest span / slowest model call / slowest tool /
first error. Click any of them and the timeline jumps to that event.

## 4. Switch to the Events tab

The Events tab is a chronological log. Look for:
- `error` events with non-null `error` field
- `log` events from your agent
- `model.call` events that look like they took 30+ seconds

## 5. Use the Compare view

Find a *known-good* trace from the same period and select both rows
in the workbench. Click **Compare** to see deltas:
- `durationMs` — the runaway
- `errorCount` — new failure
- `models` / `tools` — divergence in what was called
- `spans` — matched spans by `kind:name` with duration deltas

## 6. Bulk-export the relevant traces for the postmortem

```bash
# via the CLI:
# (steplens doesn't have a single-trace compare-with-history command;
#  use the workbench to pick the rows and bulk-export as ZIP)
```

In the Workbench, select the rows you care about (checkboxes), then
click **Export** in the Bulk action bar. The resulting `.zip` contains
one `traces/<id>.json` per row plus a `_manifest.json`.

## 7. Pin the offending trace

Click the star icon in the trace detail header. Favorited traces
are pinned to the top of the workbench so you can find them
quickly across days.

## What this recipe does NOT do

- Tell you the *cause* of the failure. StepLens records what
  happened, not why.
- Show traces from agents that don't have the SDK installed.
- Persist across machines — if Studio's SQLite is on a different
  box, you have to access it there (or use the bulk-export to copy
  snapshots).
