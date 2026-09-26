# MCP Server — Outbound OS
# Lightweight: just Node + the MCP SDK.
# Build context must be the repo root so we can copy mcp-outboundos/.

FROM node:20-slim

# curl for healthcheck
RUN apt-get update && apt-get install -y curl --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PORT=3010
ENV NODE_ENV=production

# Non-root user
RUN useradd -m -u 1001 appuser

WORKDIR /app

# Install dependencies (separate layer — only re-runs when package files change)
COPY mcp-outboundos/package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY mcp-outboundos/src ./src

RUN mkdir -p /app/data && chown -R appuser:appuser /app
USER appuser

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -sf http://localhost:${PORT}/healthz || exit 1

CMD ["node", "src/server.js"]
