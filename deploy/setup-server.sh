#!/usr/bin/env bash
# Runs ONCE on a fresh Ubuntu 24.04 server. Installs Node and Caddy, and registers the app as a service.
# Usage (on the server): sudo bash setup-server.sh <public-hostname>
#   e.g. sudo bash setup-server.sh 13-201-10-20.sslip.io
set -euo pipefail
HOST="${1:?public hostname required, e.g. 13-201-10-20.sslip.io}"

apt-get update -y
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Caddy: terminates HTTPS (needed for the microphone) and forwards to the app
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy

mkdir -p /opt/butler
chown -R ubuntu:ubuntu /opt/butler

cat > /etc/caddy/Caddyfile <<CADDY
$HOST {
    reverse_proxy localhost:3000
}
CADDY

cat > /etc/systemd/system/butler.service <<UNIT
[Unit]
Description=Butler messenger
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/opt/butler/web
ExecStart=/usr/bin/npm run start -- -p 3000
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable butler
systemctl restart caddy
echo "Server ready for $HOST. Now run deploy/push.sh from the laptop."
