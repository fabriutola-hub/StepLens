# Security Policy

## Supported versions

StepLens is at an early `0.1.x` stage. Security fixes are applied to
the latest released version only.

## Scope and threat model

StepLens is **local-first** and intended to run on a developer's
machine:

- Studio binds to `localhost:3000` and stores data in a local SQLite file at
  `~/.agent-replay/studio.db`.
- There is **no authentication, authorization, or multi-tenancy.** Anything that
  can reach the port can read and ingest traces.
- The ingest API accepts unauthenticated writes by design (it's a local tool).

**Do not expose Studio or its API to an untrusted network** without putting your
own authentication and TLS in front of it. Treat trace contents (prompts,
responses, tool I/O) as potentially sensitive — they are stored in plaintext.

## Reporting a vulnerability

If you find a security issue, please **do not open a public issue.** Instead,
report it privately to the maintainers (e.g. via a GitHub security advisory on
the repository). Include:

- A description of the issue and its impact.
- Steps to reproduce.
- Affected version(s).

We'll acknowledge the report and work with you on a fix and disclosure timeline.
