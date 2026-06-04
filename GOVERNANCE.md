# Governance

StepLens is an open-source project. This document explains how decisions get
made so contributors know what to expect and how to participate.

## Roles

### Users
Anyone who runs StepLens locally or in production. The whole product exists
for users; their feedback (via issues and Discussions) shapes the roadmap.

### Contributors
Anyone who has opened a meaningful PR — code, docs, tests, or design.
Contributors get attribution in release notes and on the contributors list.

### Maintainers
Listed in [`MAINTAINERS.md`](MAINTAINERS.md). Maintainers:
- Triage issues and PRs
- Have merge rights on `main`
- Decide on the roadmap direction (with community input)
- Cut releases

New maintainers are nominated by an existing maintainer based on consistent,
high-quality contributions, and confirmed by lazy consensus on the
maintainers' channel (no objection within 7 days).

## Decision-making

We use **lazy consensus**. For most things — bug fixes, small features, doc
improvements — anyone can open a PR and a maintainer can merge it after a
normal review. No formal process required.

For larger or controversial changes (breaking API changes, new dependencies
larger than ~50KB, architectural shifts), we use a lightweight RFC flow:

1. Open a **Discussion** in the `RFCs` category describing the problem,
   proposed change, alternatives, and migration impact.
2. Wait at least **7 days** for community input.
3. A maintainer summarizes the discussion and either accepts, rejects, or
   asks for revisions.
4. Accepted RFCs get implemented in a follow-up PR that links to the
   Discussion.

## What's in scope

StepLens is a **local-first trace inspector for AI agents**. Features that
clearly belong:
- Trace recording (SDK), inspection (Studio), and analysis (compare, hotspots).
- Integrations with popular LLM stacks (OpenAI, Anthropic, Vercel AI SDK,
  LangChain, Google Gemini, Ollama).
- OpenTelemetry interop.

Features explicitly out of scope (today):
- Hosted SaaS, accounts, authentication, multi-tenancy.
- Production monitoring / alerting.

If you're not sure whether something fits, open a Discussion before writing
code — it'll save everyone time.

## Releases

We follow [Semantic Versioning](https://semver.org). Releases are cut by a
maintainer:
1. Bump `version` in every `package.json` + runtime `*_VERSION` constants.
2. Add the release section to `CHANGELOG.md`.
3. Commit and tag (`git tag v0.X.Y`).
4. Push — the `release.yml` workflow builds, tests, and publishes to npm and
   GHCR.

## Conflict resolution

If two maintainers disagree on something significant, we discuss publicly in
the relevant issue/PR/Discussion and reach consensus. If that fails, the
project lead (currently [@fabriutola-hub](https://github.com/fabriutola-hub))
has final say.

## Changing this document

Open a PR. Substantive governance changes follow the RFC flow above.
