#!/bin/bash
# deploy-web.sh - Build and deploy Next.js dashboard on VPS
# Usage: bash deploy-web.sh

set -e

echo "🚀 WhaleScope Web Dashboard Deployment"
echo "======================================="

# Navigate to web app directory
cd /root/whalescope/apps/web

# 1. Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# 2. Build production bundle
echo "🔨 Building production bundle..."
pnpm build

# 3. Stop existing PM2 process if exists
echo "🛑 Stopping existing web process..."
pm2 stop whalescope-web 2>/dev/null || true
pm2 delete whalescope-web 2>/dev/null || true

# 4. Start new PM2 process
echo "▶️  Starting web server on port 3000..."
pm2 start npm --name "whalescope-web" -- start

# 5. Save PM2 process list
pm2 save

echo ""
echo "======================================="
echo "✅ Web Dashboard deployed!"
echo ""
echo "🔗 Access at: http://87.120.186.161:3000"
echo ""
echo "📝 View logs:"
echo "   pm2 logs whalescope-web"
echo ""
echo "🔄 To restart:"
echo "   pm2 restart whalescope-web"
