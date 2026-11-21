#!/usr/bin/env bash
# Runs on the laptop. Sends the current code to the server, builds it there and restarts the app.
# Usage: bash deploy/push.sh <server-ip> <path-to-ssh-key.pem>
#
# The key file (.env) is copied to the server so the app there can reach OpenAI and Google sign-in.
# Only the OPENAI_ and GOOGLE_CLIENT_ID lines are kept there; anything else in it (such as AWS keys)
# is removed on arrival. See on-server.sh for what happens on the server.
set -euo pipefail
IP="${1:?server ip required}"
KEY="${2:?path to .pem key required}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

tar -C "$ROOT" --exclude=web/node_modules --exclude=web/.next --exclude=web/data -czf /tmp/butler.tgz web
scp -q -i "$KEY" /tmp/butler.tgz "ubuntu@$IP:/tmp/butler.tgz"
scp -q -i "$KEY" "$ROOT/.env" "ubuntu@$IP:/opt/butler/.env"
scp -q -i "$KEY" "$ROOT/deploy/on-server.sh" "ubuntu@$IP:/tmp/on-server.sh"
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "ubuntu@$IP" "bash /tmp/on-server.sh"
