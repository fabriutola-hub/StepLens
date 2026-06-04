# Recipe: Daily cost watchdog

Use StepLens to keep a daily AI cost ceiling without any SaaS.

## 1. Run Studio on a host that runs every day

A laptop, a small VM, or a long-running container. The SQLite DB lives
at `~/.agent-replay/studio.db`.

## 2. Set a daily budget

Open `http://your-host:3000/settings` and set the **Daily budget (USD)**
to whatever you want the cap to be. Save.

A amber banner now appears at the top of the Workbench whenever the
filtered cost exceeds that number.

## 3. Optional: a CLI dashboard

```bash
steplens stats --since 24h
# 47 traces (last 24h) · 1 errors (2.1%) · $0.4823 est.
# Duration: avg 2.4s · p95 8.1s
# Tokens:   102,344
# Top models: gpt-4o (30), claude-sonnet (12)
# Top tools:  web_search (25), read_file (10)
```

Add `--json` for machine-readable output. Pipe to `jq` or a Slack
notifier:

```bash
steplens stats --since 24h --json | \
  jq -r '.estimatedCostUsd' | \
  awk '{ if ($1 > 1.00) print "Daily budget exceeded: $" $1 }'
```

## 4. Optional: prune old traces

```bash
# preview
steplens prune --older-than 30d --status error --dry-run
# confirmed
steplens prune --older-than 30d --status error --yes
```

This deletes error traces older than 30 days and prints a count.

## 5. Optional: cron it

```cron
# 9am every weekday: prune runs older than 7d
0 9 * * 1-5 cd /home/agent && npx steplens prune --older-than 7d --status error --yes
```

## What this recipe does NOT do

- Alert you in real time (we don't ship notifications; use the CLI in a
  cron + a Slack webhook if you want that).
- Account for the *current* request mid-flight — the daily total is
  computed when the Workbench fetches stats.
- Enforce the budget at the SDK layer. If you want to refuse
  recording after a threshold, write a tiny custom wrapper around
  `createClient()`.
