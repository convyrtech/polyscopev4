#!/bin/bash
# setup-caddy.sh - Install and configure Caddy on Ubuntu
# Usage: sudo bash setup-caddy.sh

set -e

echo "🚀 WhaleScope Caddy Setup Script"
echo "================================"

# 1. Install Caddy
echo "📦 Installing Caddy..."
apt update
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list

apt update
apt install -y caddy

# 2. Create log directory
echo "📁 Creating log directory..."
mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy

# 3. Copy Caddyfile
echo "📄 Installing Caddyfile..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/Caddyfile" /etc/caddy/Caddyfile

# 4. Validate config
echo "✅ Validating Caddy configuration..."
caddy validate --config /etc/caddy/Caddyfile

# 5. Reload Caddy
echo "🔄 Reloading Caddy..."
systemctl enable caddy
systemctl restart caddy

# 6. Check status
echo "📊 Caddy Status:"
systemctl status caddy --no-pager

echo ""
echo "================================"
echo "✅ Caddy setup complete!"
echo ""
echo "🔗 Your API is now available at:"
echo "   https://whalescope.87.120.186.161.sslip.io"
echo ""
echo "🧪 Test with:"
echo "   curl https://whalescope.87.120.186.161.sslip.io/"
echo ""
echo "📝 View logs:"
echo "   tail -f /var/log/caddy/whalescope.log"
echo "   journalctl -u caddy -f"
