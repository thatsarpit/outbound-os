# ── Stage 1: Build the React dashboard ──────────────────────────────────────────
# The dashboard is static files, identical on every CPU, so it is built on the
# build machine's own platform — multi-arch images then emulate only stage 2.
FROM --platform=$BUILDPLATFORM node:24-slim AS web-builder
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
# CACHE_BUST is set by CI to the commit SHA so every push produces a unique
# layer here, forcing the COPY web/ + npm run build steps below to actually
# re-execute. Without it, BuildKit was occasionally reusing a stale web/dist
# from a prior build even when web/ source had changed.
ARG CACHE_BUST=local
RUN echo "Web build cache bust: $CACHE_BUST"
COPY web/ ./
RUN npm run build

# ── Stage 2: Production runtime ──────────────────────────────────────────────────
FROM node:24-slim

LABEL org.opencontainers.image.title="Outbound OS" \
      org.opencontainers.image.description="Open-source, self-hosted WhatsApp CRM and outreach platform" \
      org.opencontainers.image.source="https://github.com/thatsarpit/outbound-os" \
      org.opencontainers.image.url="https://outboundos.space" \
      org.opencontainers.image.documentation="https://outboundos.space/docs/install" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

# SQLite for the database, curl for the healthcheck, openssl for Prisma.
RUN apt-get update && apt-get install -y \
    curl \
    sqlite3 \
    openssl \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PORT=3001
ENV NODE_ENV=production

# Run as a non-root user.
RUN useradd -m -u 1001 appuser

WORKDIR /app

# Install deps first (Docker layer cache — only invalidates on package-lock change)
COPY package*.json ./
RUN npm ci --omit=dev

# Generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source
COPY src ./src
COPY scripts ./scripts

# Copy the pre-built React dashboard from the builder stage
COPY --from=web-builder /web/dist ./web/dist

# Create runtime dirs and hand ownership to the non-root user
RUN mkdir -p logs backups data && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE ${PORT}

# Health check — /healthz is the public no-auth endpoint added in Phase A.
# Use curl (installed above) so the check doesn't spin up a second Node process.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -sf http://localhost:${PORT}/healthz || exit 1

# Apply pending migrations before the app starts. Nothing did this before, so a
# release that added a column shipped code expecting it against a database that
# did not have it — every query touching that model failed until someone ran
# the migration by hand. For a self-hosted product that is the upgrade path:
# pull the new image, restart, and the schema follows. `migrate deploy` only
# applies migrations already committed in prisma/migrations, never generates
# new ones, and is a no-op when the database is current.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node src/index.js"]
