#!/bin/bash

# Stop on error
set -e

echo "🐳 [WhaleScope] Starting Update Protocol..."

# 1. Pull Code
echo "📥 Pulling latest changes from Git..."
git pull origin main

# 2. Install Dependencies (if package.json changed)
echo "📦 Updating dependencies..."
npm install

# 3. Database Migration
echo "🗄️ Syncing Database Schema..."
cd packages/db
npx prisma db push
cd ../..

# 4. Build API
echo "🛠️ Building API..."
cd apps/api
npm run build

# 5. Restart Process
echo "🔄 Restarting Server..."
# Assuming we use PM2. If using raw node or docker, adjust here.
# For Docker Compose: docker-compose restart api
# For PM2:
if command -v pm2 &> /dev/null
then
    pm2 restart whalescope-api || pm2 start dist/index.js --name whalescope-api
else
    echo "⚠️ PM2 not found. Please restart manually or install PM2."
fi

echo "✅ [WhaleScope] Update Complete. Systems Active."
