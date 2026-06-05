#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-root@8.216.58.163}"
APP_DIR="${APP_DIR:-/opt/better-tesla}"
SERVICE="${SERVICE:-better-tesla}"

ssh "$HOST" "mkdir -p '$APP_DIR'"
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  ./ "$HOST:$APP_DIR/"

ssh "$HOST" "cat >/etc/systemd/system/$SERVICE.service <<'UNIT'
[Unit]
Description=Better Tesla web app
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=80
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now $SERVICE
systemctl restart $SERVICE
systemctl --no-pager --full status $SERVICE | sed -n '1,18p'"
