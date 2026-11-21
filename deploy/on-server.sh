#!/usr/bin/env bash
# Runs on the server, called by push.sh after the code and key file have been uploaded.
set -euo pipefail
cd /opt/butler

# Keep only the settings the app needs from the uploaded key file.
grep -E '^(OPENAI_|GOOGLE_CLIENT_ID|FAST2SMS_KEY|TWILIO_|OTP_ONSCREEN_FALLBACK|PUBLIC_URL|METRICS_TOKEN|LOG_LEVEL)' .env > .env.keep || true
mv .env.keep .env
chmod 600 .env

# Secrets the server makes for itself, once. Keeping them across deploys keeps people signed in.
if [ ! -f .server.env ]; then
  {
    echo "SESSION_SECRET=$(openssl rand -hex 32)"
    echo "TEST_LOGIN_SECRET=$(openssl rand -hex 16)"
  } > .server.env
  chmod 600 .server.env
fi

# The key that seals the data on disk. Made once and never replaced: without it the data cannot be read.
if ! grep -q '^DATA_KEY=' .server.env; then
  echo "DATA_KEY=$(openssl rand -hex 32)" >> .server.env
fi

tar -xzf /tmp/butler.tgz
cd web
npm ci --no-audit --no-fund > /tmp/npm-ci.log 2>&1
npm run build > /tmp/build.log 2>&1 || { tail -20 /tmp/build.log; exit 1; }
sudo systemctl restart butler
sleep 3
echo "settings on server: $(cut -d= -f1 /opt/butler/.env /opt/butler/.server.env | tr '\n' ' ')"
curl -s -o /dev/null -w "app on server: %{http_code}\n" http://localhost:3000/api/auth
