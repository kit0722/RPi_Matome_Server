#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
chmod +x install.sh
./install.sh
PORT=$(sudo python3 - <<'PY'
import json
try: print(int(json.load(open('/opt/rpi-matome/config.json')).get('port',8767) or 8767))
except: print(8767)
PY
)
echo '反映確認中（準備用ブラウザの起動を待ちます）'
ok=0
for i in $(seq 1 60); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/api/health" 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("version")=="0.1.241" and d.get("build")==241 and d.get("publication_mode")=="ready-only" else 1)' 2>/dev/null \
    && curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/index.html" 2>/dev/null | grep -q 'index.js?v=0308' \
    && curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/index.html" 2>/dev/null | grep -q 'index.css?v=0307' \
    && curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/reader.html" 2>/dev/null | grep -q 'reader.css?v=0300' \
    && curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/reader.html" 2>/dev/null | grep -q 'ready_viewer.js?v=0303' \
    && sudo systemctl is-active --quiet rpi-matome.service \
    && sudo systemctl is-active --quiet rpi-matome-prepare.service \
    && curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/api/preparation-status" 2>/dev/null | python3 -c 'import json,sys,time; w=json.load(sys.stdin).get("worker",{}); sys.exit(0 if w.get("state")=="running" and w.get("renderer_ready") and abs(time.time()*1000-w.get("heartbeat",0))<300000 else 1)' 2>/dev/null; then
    ok=1
    break
  fi
  sleep 1
done
if [ "$ok" -ne 1 ]; then
  echo '反映確認: 確認失敗（既存キャッシュは保持しています）'
  sudo systemctl status rpi-matome.service rpi-matome-prepare.service --no-pager -l || true
  exit 1
fi
echo '反映確認: v0.1.241 OK'
echo '準備サービス起動済み。完成した記事から一覧に表示します。'
echo "更新完了: http://$(hostname -I | awk '{print $1}'):${PORT}/"

# Yahooニュースは2chまとめとは完全に別サービスとして導入する。
# Yahoo側が失敗しても、ここまで正常確認できた2chまとめ更新は成功扱いのままにする。
YAHOO_SRC="$PWD/RPi_Yahoo_News_Server"
if [ -f "$YAHOO_SRC/install.sh" ]; then
  echo
  echo 'Yahooニュース専用サーバー（8768）を更新...'
  if bash "$YAHOO_SRC/install.sh"; then
    echo 'Yahooニュース専用サーバー: OK'
  else
    echo 'WARNING: Yahooニュース専用サーバーの更新に失敗しました。'
    echo '         2chまとめサーバー（8767）は正常に更新済みです。'
  fi
fi

# v0.1.241: keep only the just-installed distribution archive/folder.
# Runtime files under /opt/rpi-matome and its cache/database are never touched here.
BASE_DIR="$(cd .. && pwd)"
KEEP_DIR="$(basename "$PWD")"
KEEP_ZIP="${KEEP_DIR}.zip"
find "$BASE_DIR" -maxdepth 1 -mindepth 1 \
  \( -type d -o -type f \) -name 'RPi_Matome_Server_v0.1.*' \
  ! -name "$KEEP_DIR" ! -name "$KEEP_ZIP" -exec rm -rf -- {} + 2>/dev/null || true
echo "旧バージョン整理完了: ${KEEP_DIR} と ${KEEP_ZIP} を保持"
