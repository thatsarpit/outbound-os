#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DB_PATH="${ROOT_DIR}/data/test-integration-shell.db"

node -e 'const fs = require("fs"); for (const path of process.argv.slice(1)) { try { fs.unlinkSync(path); } catch (error) { if (error.code !== "ENOENT") throw error; } }' \
  "${TEST_DB_PATH}" "${TEST_DB_PATH}-journal" "${TEST_DB_PATH}-wal" "${TEST_DB_PATH}-shm"

export DATABASE_URL="file:${TEST_DB_PATH}"
# Keep production integration credentials out of the isolated test process.
# dotenv does not overwrite variables that already exist, including empty
# values, so these assertions remain deterministic even when the local .env is
# configured for the live Cloudflare webhook and website event feed.
export BREVO_WEBHOOK_PUBLIC_URL=""
export BREVO_WEBHOOK_SECRET=""
export WEBSITE_INTEGRATION_FEED_URL=""
export WEBSITE_INTEGRATION_SECRET=""
export AUTH_PROVIDER="local"
export CLERK_PUBLISHABLE_KEY=""
export CLERK_SECRET_KEY=""
export MCP_SERVICE_TOKEN="integration-service-token"
# Prisma 6's macOS arm64 schema engine can exit before its SQLite worker is
# ready unless Rust logging initializes first. RUST_LOG=debug avoids that race.
# Build the test database through the real migration chain, so a migration that
# cannot recreate the schema from empty fails here rather than on a new install.
RUST_LOG=debug npx prisma migrate deploy

INTEGRATION_DB_READY=1 \
INTEGRATION_TEST_DB_PATH="${TEST_DB_PATH}" \
node --test test/integration.test.js
