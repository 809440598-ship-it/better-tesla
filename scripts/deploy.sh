#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-root@example.com}"
APP_DIR="${APP_DIR:-/opt/better-tesla}"
SERVICE="${SERVICE:-better-tesla}"

ssh "$HOST" "mkdir -p '$APP_DIR'"
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  ./ "$HOST:$APP_DIR/"

ssh "$HOST" "cd '$APP_DIR' && npm install --omit=dev
cat >/etc/systemd/system/$SERVICE.service <<'UNIT'
[Unit]
Description=Better Tesla web app
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=80
EnvironmentFile=-/etc/better-tesla.env
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
