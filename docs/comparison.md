# How Agent Replay compares

StepLens is a **local-first trace inspector for AI agents**. It is
deliberately small: record traces from the SDK, store them in a local SQLite
file, and explore them in a local web UI (timeline, graph, step-by-step replay,
export/import). No accounts, no cloud, no telemetry.

This page is an honest orientation, not a feature scorecard. The other tools are
excellent and aimed at different problems.

## TL;DR

| | Agent Replay | LangSmith | Helicone | OpenTelemetry |
| --- | --- | --- | --- | --- |
| Primary use | Local debugging of agent runs | Hosted LLM/agent observability & evals | Hosted LLM gateway + analytics | Vendor-neutral telemetry standard |
| Hosting | Local-first (your machine) | SaaS (self-host on enterprise) | SaaS (self-host available) | Your collector/backend |
| Setup | `pnpm dev` + SDK | Account + API key | Account + proxy/base URL | Collector + instrumentation + backend |
| Data location | Local SQLite (`~/.agent-replay`) | LangChain cloud | Helicone cloud | Wherever you send it |
| Accounts/auth | None | Yes | Yes | N/A |
| Cost | Free, OSS (MIT) | Free tier + paid | Free tier + paid | Free standard; backend costs |
| Evals / datasets | Not yet | Yes | Limited | No |
| Dashboards / cost analytics | Per-trace, estimated | Yes | Yes (strong) | Via backend |
| Framework lock-in | None (any code) | Best with LangChain | Provider-level | None |

## Agent Replay vs LangSmith

**LangSmith** is a hosted platform for tracing, evaluating, and monitoring LLM
apps, with first-class LangChain/LangGraph support, datasets, and evals.

Choose **LangSmith** when you want a managed product with evaluations, team
collaboration, and production monitoring — especially on LangChain.

Choose **Agent Replay** when you want to debug an agent run **on your machine**
in seconds, with nothing to sign up for and no data leaving your laptop. It's
framework-agnostic (you instrument plain functions) and trivially scriptable.

## Agent Replay vs Helicone

**Helicone** is primarily an LLM gateway/proxy: you route provider calls through
it and get logging, caching, rate-limiting, and cost analytics with minimal code
changes.

Choose **Helicone** for production-grade request analytics, caching, and
spend monitoring across many calls.

Choose **Agent Replay** when the unit you care about is a **single agent run**
(its spans, tool calls, control flow, and where it failed) rather than aggregate
request metrics — and when you'd rather not route traffic through a third party.

## Agent Replay vs OpenTelemetry

**OpenTelemetry (OTel)** is the open standard for traces/metrics/logs. It's not a
UI — it's instrumentation plus a wire format you export to a backend (Jaeger,
Tempo, Honeycomb, etc.).

Choose **OTel** when you need vendor-neutral, organization-wide telemetry that
integrates with existing infrastructure.

Choose **Agent Replay** when you want an agent-shaped data model (traces, spans,
model calls, tool calls, tokens, estimated cost) and a ready-made local UI
without standing up a collector and backend. Agent Replay is not OTel-compatible
today; bridging to OTel is on the [roadmap](../ROADMAP.md).

## When Agent Replay is the wrong tool

- You need production monitoring, alerting, or SLAs.
- You need evaluations, datasets, or A/B testing.
- You need multi-user dashboards or RBAC.
- You need to expose it on a network (it has **no auth** — see `SECURITY.md`).

For those, reach for one of the tools above. Agent Replay aims to be the fastest
way to *see what your agent did* while you build it.
