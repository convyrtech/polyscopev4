#!/bin/bash
set -e

echo "🐳 [WhaleScope] Reloading VPS..."

# 1. Pull Code
echo "📥 Git Pull..."
git pull origin main || echo "⚠️ Git pull failed or not a git repo, continuing..."

# 2. Rebuild API
echo "🛠️ Rebuilding API..."
cd apps/api
pnpm install
pnpm run build
cd ../..

# 3. Restart Process
echo "🔄 Restarting PM2 Process (whalescope-api)..."
# Try restart, if fail, try start (assuming dist/index.js exists after build)
pm2 restart whalescope-api || pm2 start apps/api/dist/index.js --name whalescope-api

# 4. Verification
echo "📋 Verifying Logs (Tail 50)..."
sleep 3 # Give it a moment to boot
if command -v pm2 &> /dev/null
then
    pm2 logs whalescope-api --lines 50 --nostream
else
    echo "⚠️ PM2 not found. Cannot show logs."
fi

echo "✅ [WhaleScope] Reload Sequence Complete."
