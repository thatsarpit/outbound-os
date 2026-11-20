#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  printf 'Usage: bash scripts/verify-container-release.sh BASELINE_APP CANDIDATE_APP CANDIDATE_MCP\n' >&2
  exit 2
fi
baseline=$1
candidate=$2
mcp_image=$3

# These disposable instances use fixture data and run without network access.
prefix=outbound-release-$(date +%s)-$$
app=$prefix-app
mcp=$prefix-mcp
fresh=$prefix-fresh
data=$prefix-data
recovery=$prefix-recovery
volumes=()
app_created=false
mcp_created=false
cleanup() {
  local code=$?
  if [[ $code -ne 0 ]]; then
    if [[ $app_created == true ]]; then docker logs --tail 60 "$app" >&2 || true; fi
    if [[ $mcp_created == true ]]; then docker logs --tail 60 "$mcp" >&2 || true; fi
  fi
  if [[ $app_created == true ]]; then docker rm -f "$app" >/dev/null || true; fi
  if [[ $mcp_created == true ]]; then docker rm -f "$mcp" >/dev/null || true; fi
  if [[ ${#volumes[@]} -gt 0 ]]; then docker volume rm "${volumes[@]}" >/dev/null || true; fi
}
trap cleanup EXIT

fixture_email=release-admin@example.test
fixture_password=release-smoke-fixture-only
login_body=$(jq -cn --arg email "$fixture_email" --arg password "$fixture_password" '{$email, $password}')

wait_for_health() {
  local container=$1 port=$2 attempt
  for ((attempt = 0; attempt < 90; attempt++)); do
    if docker exec "$container" curl --fail --silent --max-time 2 -o /dev/null "http://127.0.0.1:$port/healthz"; then
      return
    fi
    if [[ $(docker inspect --format '{{.State.Running}}' "$container") != true ]]; then break; fi
    sleep 1
  done
  printf 'Health check failed for %s.\n' "$container" >&2
  return 1
}

start_app() {
  local image=$1 volume=$2
  docker run --pull never --detach --network none --name "$app" \
    --mount "type=volume,src=$volume,dst=/app/data" \
    -e NODE_ENV=production -e DATABASE_URL=file:/app/data/outboundos.db \
    -e AUTH_PROVIDER=local -e ADMIN_EMAIL="$fixture_email" -e ADMIN_PASSWORD="$fixture_password" "$image" >/dev/null
  app_created=true
  wait_for_health "$app" 3001
  test "$(docker exec "$app" curl -sS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/leads)" = 401
  session=$(docker exec "$app" curl -fsS --max-time 5 -H 'Content-Type: application/json' \
    --data "$login_body" http://127.0.0.1:3001/api/auth/login | jq -er '.token | select(type == "string" and length > 0)')
}

stop_app() {
  docker stop --time 25 "$app" >/dev/null
  docker rm "$app" >/dev/null
  app_created=false
}

create_lead() {
  local name=$1 mobile=$2
  local body
  body=$(jq -cn --arg name "$name" --arg mobile "$mobile" '{$name, $mobile}')
  docker exec "$app" curl -fsS --max-time 5 -H "Authorization: Bearer $session" \
    -H 'Content-Type: application/json' --data "$body" http://127.0.0.1:3001/api/leads |
    jq -er '.id | select(type == "number")'
}

assert_lead() {
  docker exec "$app" curl -fsS --max-time 5 -H "Authorization: Bearer $session" "http://127.0.0.1:3001/api/leads/$1" |
    jq -e --arg name "$2" '.name == $name' >/dev/null
}

key_fingerprint() {
  docker exec "$app" sha256sum /app/data/instance-secrets.json | cut -d ' ' -f 1
}

check_schema() {
  docker exec "$app" sh -ec '
    db=/app/data/outboundos.db
    test "$(sqlite3 "$db" "PRAGMA integrity_check")" = ok
    test -z "$(sqlite3 "$db" "PRAGMA foreign_key_check")"
    expected=$(find /app/prisma/migrations -name migration.sql -type f | wc -l | tr -d " ")
    applied=$(sqlite3 "$db" "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")
    test "$applied" -eq "$expected"
  '
}

for volume in "$fresh" "$data" "$recovery"; do
  docker volume create "$volume" >/dev/null
  volumes+=("$volume")
done

printf 'Checking a fresh app install.\n'
start_app "$candidate" "$fresh"
check_schema
stop_app

printf 'Seeding a workspace on the previous release.\n'
start_app "$baseline" "$data"
lead=$(create_lead 'Before upgrade' '+12025550111')
assert_lead "$lead" 'Before upgrade'
keys=$(key_fingerprint)
stop_app

# With the previous app stopped, copy the whole fixture volume, including keys.
docker run --pull never --rm --network none --user 0 --entrypoint sh \
  --mount "type=volume,src=$data,dst=/source,readonly" \
  --mount "type=volume,src=$recovery,dst=/app/data" \
  "$baseline" -ec 'cp -a /source/. /app/data/'

printf 'Checking the upgrade with existing data and the saved credentials.\n'
start_app "$candidate" "$data"
check_schema
test "$(key_fingerprint)" = "$keys"
assert_lead "$lead" 'Before upgrade'
upgraded_lead=$(create_lead 'After upgrade' '+12025550112')
assert_lead "$upgraded_lead" 'After upgrade'
stop_app

printf 'Checking rollback with the previous image and its recovery volume.\n'
start_app "$baseline" "$recovery"
check_schema
test "$(key_fingerprint)" = "$keys"
assert_lead "$lead" 'Before upgrade'
test "$(docker exec "$app" curl -sS --max-time 5 -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $session" "http://127.0.0.1:3001/api/leads/$upgraded_lead")" = 404
stop_app

printf 'Checking the companion MCP image.\n'
docker run --pull never --detach --network none --name "$mcp" \
  -e MCP_BEARER_TOKEN=release-smoke-mcp-fixture-only -e BACKEND_URL=http://127.0.0.1:3001 "$mcp_image" >/dev/null
mcp_created=true
wait_for_health "$mcp" 3010
test "$(docker exec "$mcp" curl -sS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:3010/mcp)" = 401
printf 'Fresh install, upgrade, rollback and MCP startup passed.\n'
