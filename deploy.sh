#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "==> git pull"
git pull origin main

echo "==> npm install"
npm install --omit=dev

echo "==> pm2 restart with new config"
pm2 delete calls 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo "==> status"
sleep 2
pm2 status
curl -s http://localhost:5002/version
echo ""
echo "==> done"
