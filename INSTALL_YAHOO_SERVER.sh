#!/bin/bash
set -euo pipefail

BASE_URL="https://raw.githubusercontent.com/kit0722/RPi_Matome_Server/main/RPi_Yahoo_News_Server"
APP="/opt/rpi-yahoo-news"
SERVICE="rpi-yahoo-news.service"
PORT="8768"
USER_NAME="${SUDO_USER:-$USER}"

if [ "$USER_NAME" = "root" ]; then
  echo "通常ユーザー（kit等）で実行してください。"
  exit 1
fi

for cmd in curl python3 systemctl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: $cmd が見つかりません。"
    exit 1
  fi
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/web"

echo "[1/5] GitHubからYahoo専用サーバーを取得..."
curl -fsSL --retry 3 --connect-timeout 10 "$BASE_URL/server.py" -o "$TMP/server.py"
curl -fsSL --retry 3 --connect-timeout 10 "$BASE_URL/web/index.html" -o "$TMP/web/index.html"
curl -fsSL --retry 3 --connect-timeout 10 "$BASE_URL/web/styles.css" -o "$TMP/web/styles.css"
curl -fsSL --retry 3 --connect-timeout 10 "$BASE_URL/web/app.js" -o "$TMP/web/app.js"
curl -fsSL --retry 3 --connect-timeout 10 "$BASE_URL/latest.json" -o "$TMP/latest.json"
curl -fsSL --retry 3 --connect-timeout 10 "$BASE_URL/README.txt" -o "$TMP/README.txt"

echo "[2/5] Python構文を確認..."
python3 -m py_compile "$TMP/server.py"

echo "[3/5] /opt/rpi-yahoo-news へ配置..."
sudo systemctl stop "$SERVICE" 2>/dev/null || true
sudo mkdir -p "$APP/web"
sudo install -m 0644 "$TMP/server.py" "$APP/server.py"
sudo install -m 0644 "$TMP/web/index.html" "$APP/web/index.html"
sudo install -m 0644 "$TMP/web/styles.css" "$APP/web/styles.css"
sudo install -m 0644 "$TMP/web/app.js" "$APP/web/app.js"
sudo install -m 0644 "$TMP/latest.json" "$APP/latest.json"
sudo install -m 0644 "$TMP/README.txt" "$APP/README.txt"

sudo tee "$APP/update.sh" >/dev/null <<'UPD'
#!/bin/bash
set -euo pipefail
curl -fsSL --retry 3 --connect-timeout 10 \
  https://raw.githubusercontent.com/kit0722/RPi_Matome_Server/main/INSTALL_YAHOO_SERVER.sh \
  | bash
UPD
sudo chmod 0755 "$APP/update.sh"
sudo chown -R "$USER_NAME":"$(id -gn "$USER_NAME")" "$APP"

echo "[4/5] systemdサービスを登録・起動..."
sudo tee "/etc/systemd/system/$SERVICE" >/dev/null <<EOF
[Unit]
Description=RPi Yahoo News Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$APP
ExecStart=/usr/bin/python3 $APP/server.py --host 0.0.0.0 --port $PORT
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE" >/dev/null
sudo systemctl restart "$SERVICE"

echo "[5/5] 起動確認..."
ok=0
for i in $(seq 1 20); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/health" 2>/dev/null \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("ok") and d.get("version")=="0.1.3" and d.get("cache") is True and d.get("cache_mode")=="text-only" and d.get("image_cache") is False else 1)' 2>/dev/null; then
    ok=1
    break
  fi
  sleep 1
done

if [ "$ok" -ne 1 ]; then
  echo
  echo "ERROR: Yahoo専用サーバーの起動確認に失敗しました。"
  sudo systemctl status "$SERVICE" --no-pager -l || true
  echo
  sudo journalctl -u "$SERVICE" -n 80 --no-pager || true
  exit 1
fi

echo
echo "=============================================="
echo " RPi Yahoo News Server 起動OK"
echo "=============================================="
curl -fsS "http://127.0.0.1:$PORT/api/health"
echo
hostname -I | awk -v p="$PORT" '{for(i=1;i<=NF;i++) if($i ~ /^[0-9]+\./) print "  http://"$i":"p"/"}'
echo
curl -fsS --max-time 30 "http://127.0.0.1:$PORT/api/list?category=latest" >/dev/null 2>&1 || true
# 更新ボタンが戻る前に、先頭記事の文字キャッシュを最低3件だけ先取りする。
# 画像本体は保存しない。30秒で打ち切り、Yahoo側が遅くても更新自体は失敗させない。
for i in $(seq 1 30); do
  COUNT=$(find "$APP/cache/articles" -maxdepth 1 -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
  if [ "${COUNT:-0}" -ge 3 ]; then break; fi
  sleep 1
done
echo "最新一覧キャッシュ準備済み（画像本体は保存しません）"
echo "2chまとめ(8767)とは完全に別サービスです。"
echo "今後Yahooだけ更新: $APP/update.sh"
