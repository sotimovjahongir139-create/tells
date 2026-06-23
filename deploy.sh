#!/bin/bash
set -e

APP_DIR="/root/calls"
cd "$APP_DIR"

echo "==> git pull"
git pull origin main

echo "==> npm install"
npm install

echo "==> prisma generate + db push"
npx prisma generate
npx prisma db push --accept-data-loss

echo "==> npm build"
npm run build

echo "==> pm2 restart"
pm2 restart calls 2>/dev/null || pm2 start ecosystem.config.js

pm2 save
echo "==> Done"
