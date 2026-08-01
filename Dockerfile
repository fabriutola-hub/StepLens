# StepLens — standalone, local-first Docker image.
#
# Build:
#   docker build -t steplens .
#
# Run (persist the local SQLite DB in a named volume):
#   docker run --rm -p 3000:3000 -v steplens-data:/data steplens
#
# Then open http://localhost:3000. Point the SDK/CLI at it as usual
# (AGENT_REPLAY_ENDPOINT=http://localhost:3000).
#
# GHCR:
#   ghcr.io/fabriutola-hub/steplens:latest
#   ghcr.io/fabriutola-hub/steplens:0.8.0

# ── Builder ───────────────────────────────────────────────────────────────────
# Full image so better-sqlite3 / sharp can compile if no prebuilt binary exists.
FROM node:25-bookworm AS builder
# Tell the Studio Next.js config to emit a standalone server bundle.
ENV STUDIO_STANDALONE=1
WORKDIR /repo
RUN corepack enable

# Source is copied wholesale; .dockerignore keeps node_modules/.next/etc out so
# native modules are built fresh for linux inside this stage.
COPY . .
RUN pnpm install --frozen-lockfile
# Build the workspace dependency used by Studio, then build Studio with webpack.
# Next 16's Turbopack build does not currently emit the classic .next/standalone
# directory that this Docker runner copies below.
RUN pnpm --filter @agent-replay/core build \
 && pnpm --filter @agent-replay/studio build:standalone

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:25-bookworm-slim AS runner

# OCI labels
ARG VERSION=0.8.0
ARG COMMIT_SHA=unknown
LABEL org.opencontainers.image.title="StepLens" \
      org.opencontainers.image.description="Local-first trace inspector for AI agents" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/fabriutola-hub/StepLens" \
      org.opencontainers.image.revision="${COMMIT_SHA}" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HOME=/data
WORKDIR /app

# Next.js standalone server bundle + its traced node_modules (incl. better-sqlite3).
COPY --from=builder /repo/apps/studio/.next/standalone ./
# Static assets and public files (not part of the standalone trace).
COPY --from=builder /repo/apps/studio/.next/static ./apps/studio/.next/static
COPY --from=builder /repo/apps/studio/public ./apps/studio/public

# Local-first SQLite database lives under $HOME/.agent-replay (here: /data).
RUN mkdir -p /data/.agent-replay
VOLUME /data

EXPOSE 3000
CMD ["node", "apps/studio/server.js"]
