#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "==> git pull"
git pull origin main
echo "==> npm install"
npm install --omit=dev
echo "==> pm2 restart"
pm2 delete calls 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
echo "==> Done — app on :5002"
