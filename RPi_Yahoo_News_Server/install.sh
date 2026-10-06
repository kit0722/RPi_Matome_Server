#!/bin/bash
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
APP=/opt/rpi-yahoo-news
USER_NAME="${SUDO_USER:-$USER}"
if [ "$USER_NAME" = root ]; then echo '通常ユーザー（kit等）で実行してください。'; exit 1; fi
echo '[Yahoo 1/4] 専用サーバーを配置'
sudo systemctl stop rpi-yahoo-news.service 2>/dev/null || true
sudo mkdir -p "$APP"
sudo install -m 0644 "$SRC/server.py" "$APP/server.py"
sudo rm -rf "$APP/web" && sudo cp -a "$SRC/web" "$APP/web"
sudo chown -R "$USER_NAME":"$(id -gn "$USER_NAME")" "$APP"
echo '[Yahoo 2/4] systemdサービスを作成'
sudo tee /etc/systemd/system/rpi-yahoo-news.service >/dev/null <<EOF
[Unit]
Description=RPi Yahoo News Server
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$APP
ExecStart=/usr/bin/python3 $APP/server.py --host 0.0.0.0 --port 8768
Restart=on-failure
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF
echo '[Yahoo 3/4] 起動'
sudo systemctl daemon-reload
sudo systemctl enable rpi-yahoo-news.service >/dev/null
sudo systemctl restart rpi-yahoo-news.service
for i in $(seq 1 20); do
  if curl -fsS --max-time 2 http://127.0.0.1:8768/api/health 2>/dev/null | python3 -c 'import json,sys;d=json.load(sys.stdin);sys.exit(0 if d.get("version")=="0.1.0" and d.get("cache") is False else 1)' 2>/dev/null; then break; fi
  if [ "$i" -eq 20 ]; then sudo systemctl status rpi-yahoo-news.service --no-pager -l || true; exit 1; fi
  sleep 1
done
echo '[Yahoo 4/4] 完了（保存キャッシュなし / 1分新着確認）'
hostname -I | awk '{for(i=1;i<=NF;i++) if($i ~ /^[0-9]+\./) print "  http://"$i":8768/"}'
