#!/usr/bin/env bash
# Scribble GP on an Oracle Cloud "Always Free" server (Ubuntu). Run it on the server:
#   curl -fsSL https://raw.githubusercontent.com/ScorTeddy/Racer/main/tools/oracle-setup.sh | bash
# Safe to run again (it just updates things). It:
#   1. installs Node.js, git and Caddy (Caddy gives the site https, free, by itself)
#   2. downloads the game and installs its packages
#   3. makes ~/scribble.env for your secret settings (YOU fill it in: it never goes on GitHub)
#   4. runs the game as a service (starts by itself, restarts if it crashes or the server reboots)
#   5. checks GitHub every 5 minutes and updates the game when you push (like Render did)
set -euo pipefail

APP_DIR="$HOME/racer"
ENV_FILE="$HOME/scribble.env"
REPO="https://github.com/ScorTeddy/Racer.git"
PORT=3000
ME="$(whoami)"

echo "== 1/6 Installing Node.js, git, Caddy =="
sudo apt-get update -y
sudo apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https netfilter-persistent iptables-persistent
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y && sudo apt-get install -y caddy
fi

echo "== 2/6 Downloading the game =="
if [ -d "$APP_DIR/.git" ]; then git -C "$APP_DIR" pull --ff-only; else git clone "$REPO" "$APP_DIR"; fi
(cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund)

echo "== 3/6 Your web address =="
IP="$(curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me)"
SITE="${IP//./-}.sslip.io"          # a free name that points at this server, so it can have https
echo "Your game will be at: https://$SITE"

echo "== 4/6 Secret settings file =="
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
# Scribble GP settings. Copy each value from Render > your service > Environment (same names).
# Leave a line empty if you never had it. After changing this file: sudo systemctl restart scribble
NODE_ENV=production
PORT=$PORT
SITE_URL=https://$SITE
DATA_DIR=$HOME/scribble-data
MUSIC_CACHE=$HOME/scribble-music

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
ACCOUNT_SECRET=
GOOGLE_CLIENT_ID=
ELEVENLABS_API_KEY=
COMMENTATOR_VOICE=
COMMENTATOR_MODEL=
RESEND_API_KEY=
SUGGEST_EMAIL=
SUGGEST_ADMIN=
EOF
  echo "Made $ENV_FILE (fill it in next: nano ~/scribble.env)"
else
  echo "$ENV_FILE already there: left as it is"
fi
chmod 600 "$ENV_FILE"

echo "== 5/6 Running the game as a service =="
sudo tee /etc/systemd/system/scribble.service >/dev/null <<EOF
[Unit]
Description=Scribble GP
After=network-online.target
Wants=network-online.target

[Service]
User=$ME
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
# auto-update: every 5 minutes, pull from GitHub; if anything changed, reinstall packages and restart
sudo tee /usr/local/bin/scribble-update >/dev/null <<EOF
#!/usr/bin/env bash
set -e
cd "$APP_DIR"
git fetch -q origin main
if [ "\$(git rev-parse HEAD)" != "\$(git rev-parse origin/main)" ]; then
  git reset -q --hard origin/main
  npm ci --omit=dev --no-audit --no-fund >/dev/null
  sudo systemctl restart scribble
  echo "updated to \$(git rev-parse --short HEAD)"
fi
EOF
sudo chmod +x /usr/local/bin/scribble-update
sudo tee /etc/systemd/system/scribble-update.service >/dev/null <<EOF
[Unit]
Description=Update Scribble GP from GitHub
[Service]
Type=oneshot
User=$ME
ExecStart=/usr/local/bin/scribble-update
EOF
sudo tee /etc/systemd/system/scribble-update.timer >/dev/null <<EOF
[Unit]
Description=Check GitHub for Scribble GP updates every 5 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
EOF
echo "$ME ALL=(root) NOPASSWD: /usr/bin/systemctl restart scribble" | sudo tee /etc/sudoers.d/scribble >/dev/null
sudo chmod 440 /etc/sudoers.d/scribble
sudo systemctl daemon-reload
sudo systemctl enable --now scribble scribble-update.timer
sudo systemctl restart scribble

echo "== 6/6 https + opening the web ports =="
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$SITE {
  encode zstd gzip
  reverse_proxy localhost:$PORT
}
EOF
# Oracle's Ubuntu blocks everything but SSH by default: let web traffic in (80 for the https setup, 443 for the site)
for p in 80 443; do
  if ! sudo iptables -C INPUT -m state --state NEW -p tcp --dport $p -j ACCEPT 2>/dev/null; then
    # (in front of Oracle's "reject everything else" rule, if it's there)
    rj="$(sudo iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')"
    if [ -n "$rj" ]; then sudo iptables -I INPUT "$rj" -m state --state NEW -p tcp --dport $p -j ACCEPT
    else sudo iptables -A INPUT -m state --state NEW -p tcp --dport $p -j ACCEPT; fi
  fi
done
sudo netfilter-persistent save
sudo systemctl enable caddy
sudo systemctl restart caddy

echo
echo "All set up! Next:"
echo "  1. nano ~/scribble.env      (paste your settings from Render, then Ctrl+O, Enter, Ctrl+X)"
echo "  2. sudo systemctl restart scribble"
echo "  3. Open https://$SITE      (the very first visit can take a minute while it gets its https certificate)"
echo "Logs if something's wrong: journalctl -u scribble -n 50"
