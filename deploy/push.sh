#!/usr/bin/env bash
# Runs on the laptop. Sends the current code to the server, builds it there and restarts the app.
# Usage: bash deploy/push.sh <server-ip> <path-to-ssh-key.pem>
# The key file (.env) is copied to the server too, so the app there can reach OpenAI.
set -euo pipefail
IP="${1:?server ip required}"
KEY="${2:?path to .pem key required}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new ubuntu@$IP"

tar -C "$ROOT" --exclude=web/node_modules --exclude=web/.next --exclude=web/data -czf /tmp/butler.tgz web
scp -i "$KEY" /tmp/butler.tgz "ubuntu@$IP:/tmp/butler.tgz"
scp -i "$KEY" "$ROOT/.env" "ubuntu@$IP:/opt/butler/.env"
$SSH 'set -e; cd /opt/butler && tar -xzf /tmp/butler.tgz && cd web && npm ci --no-audit --no-fund && npm run build && sudo systemctl restart butler && sleep 3 && curl -s -o /dev/null -w "app on server: %{http_code}\n" http://localhost:3000/api/state'
