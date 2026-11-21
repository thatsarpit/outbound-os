#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."

repository=ghcr.io/thatsarpit/outbound-os
marker='# Managed by the Outbound OS guided installer'
email= business= version= public_url= port= zone=
check=false
provided=false

fail() { printf 'Setup: %s\n' "$*" >&2; exit 1; }
usage() {
  cat <<'HELP'
Usage: bash setup/install.sh [--email EMAIL] [--business NAME] [--timezone ZONE]
                             [--port PORT] [--public-url HTTPS_ORIGIN]
                             [--version RELEASE] [--check]

The default builds from this checkout. --version selects a published tag
without its leading v. The image must include the guided installer support.
Re-run without options to resume. --check verifies the running installation.
HELP
}

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help) usage; exit 0 ;;
    --check) check=true; shift; continue ;;
    --email|--business|--timezone|--port|--public-url|--version)
      [[ $# -ge 2 && $2 != --* ]] || fail "$1 needs a value."
      provided=true
      case $1 in
        --email) email=$2 ;;
        --business) business=$2 ;;
        --timezone) zone=$2 ;;
        --port) port=$2 ;;
        --public-url) public_url=$2 ;;
        --version) version=$2 ;;
      esac
      shift 2 ;;
    *) fail 'Unknown option. Run bash setup/install.sh --help.' ;;
  esac
done

# Avoid accidental overrides from another project's shell or Compose files.
unset COMPOSE_FILE COMPOSE_ENV_FILES COMPOSE_PROJECT_NAME COMPOSE_PROFILES
unset OUTBOUNDOS_APP_IMAGE OUTBOUNDOS_VERSION OUTBOUNDOS_PORT OUTBOUNDOS_BIND_ADDRESS
compose() { docker compose --env-file .env -f docker-compose.yml "$@"; }
verify_image() {
  local support
  support=$(docker image inspect --format '{{index .Config.Labels "space.outboundos.guided-install"}}' "$1")
  [[ $support == 1 ]] || fail 'This image predates guided setup. Choose a supported release or build the current checkout.'
}

command -v docker >/dev/null || fail 'Install Docker with Compose v2, then rerun.'
docker compose version >/dev/null 2>&1 || fail 'Install Docker Compose v2 or start Docker Desktop.'
endpoint=${DOCKER_HOST:-}
if [[ -n ${DOCKER_CONTEXT:-} || -z $endpoint ]]; then
  endpoint=$(docker context inspect --format '{{.Endpoints.docker.Host}}')
fi
case $endpoint in
  unix://*|npipe://*) ;;
  *) fail 'Use the local Docker context. For a VPS, run this setup on that server.' ;;
esac
# A stalled Docker Desktop socket can otherwise block daemon checks indefinitely.
if [[ $endpoint == unix://* ]] && command -v curl >/dev/null; then
  curl -fsS --noproxy '*' --max-time 10 --unix-socket "${endpoint#unix://}" \
    -o /dev/null http://localhost/_ping 2>/dev/null ||
    fail 'Docker did not answer. Start Docker, check your access to the engine, and rerun.'
fi
if ! arch=$(docker info --format '{{.OSType}}/{{.Architecture}}' 2>/dev/null); then
  fail 'Cannot connect to Docker. Start Docker or check your access to the Docker Engine.'
fi
case $arch in
  linux/aarch64|linux/arm64|linux/x86_64|linux/amd64) ;;
  *) fail 'Use a Linux-container Docker engine on amd64 or arm64.' ;;
esac
up_help=$(docker compose up --help)
[[ $up_help == *--wait-timeout* ]] || fail 'Update Docker Compose to a version supporting up --wait-timeout.'

setting() {
  awk -v key="$1=" 'index($0, key) == 1 { value = substr($0, length(key) + 1) } END { print value }' .env
}
valid_email() { [[ $1 =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; }
valid_port() { [[ $1 =~ ^[1-9][0-9]{0,4}$ ]] && (( $1 <= 65535 )); }
valid_origin() { [[ $1 =~ ^https://[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$ ]]; }

if [[ -e .env || -L .env ]]; then
  [[ -f .env && ! -L .env ]] || fail '.env must be a regular file.'
  IFS= read -r first_line < .env || true
  [[ $first_line == "$marker" ]] || fail 'This checkout already has its own .env. See setup/install.md for existing installs.'
  [[ $provided == false ]] || fail 'Settings already exist. Rerun without flags to resume, or edit .env deliberately.'
elif [[ $check == true ]]; then
  fail 'Run the installer before checking this instance.'
else
  if [[ -z $email && -t 0 ]]; then read -r -p 'Admin email: ' email; fi
  valid_email "$email" || fail 'Enter a valid admin email, or pass --email EMAIL.'
  port=${port:-3001}
  valid_port "$port" || fail '--port must be between 1 and 65535.'
  zone=${zone:-UTC}
  [[ $zone =~ ^[A-Za-z0-9_+/-]+$ && $zone != /* && -f /usr/share/zoneinfo/$zone ]] ||
    fail 'Use an installed time zone, such as Asia/Kolkata or UTC.'
  [[ -z $public_url ]] || valid_origin "$public_url" ||
    fail '--public-url needs an HTTPS hostname with no path or trailing slash.'
  [[ ! $business =~ [[:cntrl:]] && $business != *\\* ]] || fail 'Use a single line without backslashes for --business.'
  [[ -z $version || $version =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]] ||
    fail '--version must be a published release tag without the leading v.'

  project=$(basename "$PWD" | LC_ALL=C tr '[:upper:]' '[:lower:]' | LC_ALL=C tr -cd 'a-z0-9_-' | sed 's/^[^a-z0-9]*//')
  [[ -n $project && ${#project} -le 64 ]] || fail 'Use a checkout directory name of 1–64 letters, digits or hyphens.'
  containers=$(docker ps -aq --filter "label=com.docker.compose.project=$project")
  volumes=$(docker volume ls -q --filter "label=com.docker.compose.project=$project")
  [[ -z $containers && -z $volumes ]] ||
    fail 'Docker already has resources for this checkout name. Recover its original .env or use another checkout.'
  if command -v nc >/dev/null && nc -z -w 1 127.0.0.1 "$port" >/dev/null 2>&1; then
    fail "Port $port is in use. Choose another with --port."
  fi

  if [[ -n $version ]]; then
    docker pull "$repository:$version" || fail 'Could not pull that release. Check the tag and registry access.'
    digests=$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$repository:$version")
    image=$(printf '%s\n' "$digests" | awk -v prefix="$repository@" 'index($0,prefix)==1 { print; exit }')
    [[ $image =~ ^ghcr\.io/thatsarpit/outbound-os@sha256:[a-f0-9]{64}$ ]] ||
      fail 'Could not resolve the release image digest.'
    verify_image "$image"
  else
    image=outbound-os:guided-$project-$(date +%s)-$$
  fi

  staged=$(mktemp .env.setup.XXXXXX)
  trap 'rm -f "$staged"' EXIT
  # Compose single quotes keep the supplied business name literal.
  business=${business//\'/\\\'}
  {
    printf '%s\n' "$marker"
    printf 'COMPOSE_PROJECT_NAME=%s\nOUTBOUNDOS_APP_IMAGE=%s\n' "$project" "$image"
    printf 'OUTBOUNDOS_BIND_ADDRESS=127.0.0.1\nOUTBOUNDOS_PORT=%s\n' "$port"
    printf 'DATABASE_URL=file:/app/data/outboundos.db\nNODE_ENV=production\n'
    if [[ -n $version ]]; then printf 'OUTBOUNDOS_VERSION=%s\n' "$version"; fi
    printf 'AUTH_PROVIDER=local\nADMIN_EMAIL=%s\nADMIN_PASSWORD=\n' "$email"
    printf "BUSINESS_NAME='%s'\nBUSINESS_TIMEZONE=%s\n" "$business" "$zone"
    printf 'PUBLIC_URL=%s\n' "$public_url"
  } > "$staged"
  ln "$staged" .env || fail 'Another process created .env. Check the file and rerun.'
fi

email=$(setting ADMIN_EMAIL)
port=$(setting OUTBOUNDOS_PORT)
public_url=$(setting PUBLIC_URL)
image=$(setting OUTBOUNDOS_APP_IMAGE)
valid_email "$email" && valid_port "$port" || fail 'Check ADMIN_EMAIL and OUTBOUNDOS_PORT in the saved .env.'
[[ -z $public_url ]] || valid_origin "$public_url" || fail 'Check PUBLIC_URL in the saved .env.'
[[ $(setting OUTBOUNDOS_BIND_ADDRESS) == 127.0.0.1 ]] || fail 'The guided installer expects a loopback bind.'

if [[ $check == false ]]; then
  case $image in
    outbound-os:guided-*)
      if ! docker image inspect "$image" >/dev/null 2>&1; then
        revision=
        if [[ -e .git ]] && changes=$(git status --porcelain 2>/dev/null) && [[ -z $changes ]]; then
          revision=$(git rev-parse HEAD 2>/dev/null || true)
        fi
        compose build --build-arg "OUTBOUNDOS_BUILD_REVISION=$revision" app ||
          fail 'Could not build the app. Fix the build error and rerun to resume.'
      fi
      ;;
    ghcr.io/thatsarpit/outbound-os@sha256:*)
      docker image inspect "$image" >/dev/null 2>&1 ||
        docker pull "$image" || fail 'Could not pull the saved release digest.'
      ;;
    *) fail 'Check OUTBOUNDOS_APP_IMAGE in the saved .env.' ;;
  esac
  verify_image "$image"
  compose up -d --no-build --pull never --wait --wait-timeout 150 app ||
    fail 'The app did not become healthy. Check docker compose ps and the app logs, then rerun.'
fi

compose exec -T app curl -fsS -o /dev/null http://127.0.0.1:3001/healthz ||
  fail 'The app health endpoint did not respond. Check docker compose ps.'
if ! admin_state=$(compose exec -T app node scripts/reset-password.mjs "$email" --status); then
  fail 'Could not check the first admin. Confirm ADMIN_EMAIL and that the image includes this installer.'
fi
case $admin_state in
  configured) ;;
  needs-password)
    if [[ $check == false && -t 0 ]]; then
      compose exec app node scripts/reset-password.mjs "$email" --initial
    else
      printf 'Set the first password in a private terminal:\n  docker compose exec app node scripts/reset-password.mjs %s --initial\n' "$email"
      exit 1
    fi ;;
  *) fail 'Could not determine whether the first admin has a password.' ;;
esac

if command -v curl >/dev/null; then
  curl -fsS --noproxy 127.0.0.1 --max-time 5 -o /dev/null "http://127.0.0.1:$port/healthz" ||
    fail 'The container is healthy, but the published loopback port did not respond.'
fi

printf 'Sign in locally at http://127.0.0.1:%s with %s.\n' "$port" "$email"
if [[ -n $public_url ]]; then
  if command -v curl >/dev/null && curl -fsS --max-time 10 "$public_url/healthz" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'; then
    printf 'Public HTTPS health check passed at %s. Sign in there before connecting channels.\n' "$public_url"
  else
    printf 'Point your HTTPS reverse proxy at http://127.0.0.1:%s, then run bash setup/install.sh --check.\n' "$port"
    [[ $check == false ]]
  fi
fi
