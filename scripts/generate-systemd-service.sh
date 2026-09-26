#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="${1:-outbound-os}"
ENV_FILE="${2:-$ROOT_DIR/.env}"
OUT_DIR="${3:-$ROOT_DIR/deploy}"
OUT_FILE="$OUT_DIR/${SERVICE_NAME}.service"

mkdir -p "$OUT_DIR"

cat > "$OUT_FILE" <<EOF
[Unit]
Description=Outbound OS (${SERVICE_NAME})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${ROOT_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/env npm start
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30
User=$(id -un)
Group=$(id -gn)
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

echo "Generated systemd unit: $OUT_FILE"
echo "Install on Linux VM:"
echo "  sudo cp \"$OUT_FILE\" /etc/systemd/system/${SERVICE_NAME}.service"
echo "  sudo systemctl daemon-reload"
echo "  sudo systemctl enable --now ${SERVICE_NAME}.service"
echo "  sudo systemctl status ${SERVICE_NAME}.service"
