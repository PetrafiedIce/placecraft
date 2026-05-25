#!/usr/bin/env bash
# Placecraft one-shot installer for Ubuntu 22.04 / 24.04.
#
# Usage on the target server:
#   curl -fsSL https://raw.githubusercontent.com/PetrafiedIce/placecraft/main/scripts/install.sh | sudo bash
#
# For HTTPS via Caddy (needs an A record pointing to this server):
#   curl -fsSL https://raw.githubusercontent.com/PetrafiedIce/placecraft/main/scripts/install.sh | sudo DOMAIN=placecraft.example.com bash
#
# Re-run anytime to pull latest and restart cleanly.

set -euo pipefail

REPO="https://github.com/PetrafiedIce/placecraft.git"
APP_DIR="/opt/placecraft"
SERVICE_USER="placecraft"
PORT="${PORT:-3000}"
DOMAIN="${DOMAIN:-}"
ADMIN_SECRET="${ADMIN_SECRET:-}"

if [ "$(id -u)" -ne 0 ]; then
  echo "✗ Run as root: sudo bash $0  (or via curl ... | sudo bash)" >&2
  exit 1
fi

log() { printf "\n\033[1;36m== %s ==\033[0m\n" "$*"; }

log "Updating apt"
apt-get update -y

log "Installing prerequisites (git, curl, build tools)"
apt-get install -y git curl ca-certificates gnupg

# ---------- Node 22 ----------
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 20 ]; then
  log "Installing Node.js 22 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
else
  log "Node $(node -v) already installed"
fi

# ---------- Service user ----------
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  log "Creating service user '$SERVICE_USER'"
  useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

# ---------- Clone or update repo ----------
if [ ! -d "$APP_DIR/.git" ]; then
  log "Cloning $REPO into $APP_DIR"
  git clone "$REPO" "$APP_DIR"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
else
  log "Pulling latest in $APP_DIR"
  sudo -u "$SERVICE_USER" git -C "$APP_DIR" fetch origin
  sudo -u "$SERVICE_USER" git -C "$APP_DIR" reset --hard origin/main
fi

# ---------- npm install ----------
log "Installing npm dependencies (this can take a minute)"
sudo -u "$SERVICE_USER" -H bash -c "cd '$APP_DIR' && npm install --omit=dev"

# Persistent canvas state directory
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" "$APP_DIR/data"

# ---------- systemd unit ----------
log "Writing /etc/systemd/system/placecraft.service"
NODE_BIN="$(command -v node)"
cat > /etc/systemd/system/placecraft.service <<EOF
[Unit]
Description=Placecraft — collaborative Minecraft pixel canvas
Documentation=https://github.com/PetrafiedIce/placecraft
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
$( [ -n "$ADMIN_SECRET" ] && echo "Environment=ADMIN_SECRET=$ADMIN_SECRET" )
ExecStart=$NODE_BIN server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

# Tighten the sandbox a bit
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$APP_DIR/data

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable placecraft
systemctl restart placecraft

# ---------- Optional Caddy reverse proxy ----------
if [ -n "$DOMAIN" ]; then
  log "Setting up Caddy reverse proxy for $DOMAIN"
  if ! command -v caddy >/dev/null 2>&1; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy
  fi

  cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
    reverse_proxy localhost:$PORT
    encode zstd gzip
    log {
        output file /var/log/caddy/placecraft.log
        format console
    }
}
EOF
  systemctl restart caddy
  PUBLIC_URL="https://$DOMAIN"
else
  # No domain → expose port via UFW if firewall is active
  if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    log "Opening port $PORT in ufw"
    ufw allow "$PORT/tcp" >/dev/null || true
  fi
  PUBLIC_IP="$(curl -fsSL https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
  PUBLIC_URL="http://$PUBLIC_IP:$PORT"
fi

# ---------- Status ----------
sleep 1
log "Status"
systemctl --no-pager --lines=8 status placecraft || true

printf "\n\033[1;32m✓ Placecraft installed and running\033[0m\n"
printf "   URL:        %s\n" "$PUBLIC_URL"
printf "   Logs:       sudo journalctl -u placecraft -f\n"
printf "   Restart:    sudo systemctl restart placecraft\n"
printf "   Update:     sudo bash %s   # re-run this script\n" "$0"
if [ -n "$DOMAIN" ]; then
  printf "   Caddy logs: sudo journalctl -u caddy -f\n"
fi
printf "\n"
