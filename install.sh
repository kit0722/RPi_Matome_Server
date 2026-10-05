#!/bin/bash
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
APP=/opt/rpi-matome
USER_NAME="${SUDO_USER:-$USER}"
if [ "$USER_NAME" = root ]; then
  echo '通常ユーザー（kit等）で ./UPDATE_ONLY.sh を実行してください。'
  exit 1
fi

echo '[1/5] 準備処理とスマホ画像圧縮に必要なChromium / Selenium / Pillowを確認'
if ! command -v chromium >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1 \
   || ! command -v chromedriver >/dev/null 2>&1 \
   || ! /usr/bin/python3 -c 'from selenium.webdriver.chrome.service import Service' >/dev/null 2>&1 \
   || ! /usr/bin/python3 -c 'from PIL import Image,features; assert features.check("webp")' >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y chromium chromium-driver python3-selenium python3-pil
fi
/usr/bin/python3 -c 'from selenium.webdriver.chrome.service import Service'
/usr/bin/python3 -c 'from PIL import Image,features; assert features.check("webp")'
command -v chromedriver >/dev/null

echo '[2/5] 本体を配置（既存キャッシュ・設定は保持）'
sudo systemctl stop rpi-matome-prepare.service 2>/dev/null || true
sudo systemctl stop rpi-matome.service 2>/dev/null || true
sudo mkdir -p "$APP" "$APP/cache/data" "$APP/cache/state"
for name in server.py ready_store.py prepare_worker.py video_stream.py README.txt; do
  sudo install -m 0644 "$SRC/$name" "$APP/$name"
done
sudo rm -rf "$APP/web"
sudo cp -a "$SRC/web" "$APP/web"
for name in install.sh UPDATE_ONLY.sh update.sh status.sh; do
  sudo install -m 0755 "$SRC/$name" "$APP/$name"
done
if [ ! -f "$APP/config.json" ]; then sudo install -m 0644 "$SRC/config.json" "$APP/config.json"; fi
# 既存設定を保持しつつ、現在必要な安定設定だけを原子的に追加/移行する。
sudo /usr/bin/python3 - <<'MOBILECFG'
import json, os, tempfile
p='/opt/rpi-matome/config.json'
try:
    with open(p,encoding='utf-8') as f:d=json.load(f)
    if not isinstance(d,dict):raise ValueError('config root is not an object')
except Exception as e:
    raise SystemExit(f'config.json を読み込めないため更新を中止しました（既存設定は変更していません）: {e}')
for k,v in {
    'mobile_image_enabled':True,'mobile_image_max_width':720,'mobile_image_quality':55,
    'mobile_image_workers':1,'upstream_workers':2,'upstream_text_max_mb':32,
    'turnover_reserve_mb':768,
    'standby_articles':1000,
    'instagram_prefetch_enabled':True,
    'selenium_max_active':1,'selenium_lock_wait_seconds':30,'selenium_load_wait_seconds':45,
    'selenium_start_timeout_seconds':25,'selenium_page_load_timeout_seconds':35,
    'selenium_script_timeout_seconds':90,'selenium_article_hard_timeout_seconds':120,
    'selenium_instagram_hard_timeout_seconds':30,'selenium_quit_timeout_seconds':6,
    'selenium_recycle_after_operations':6,'selenium_recycle_after_seconds':240,
    'selenium_min_available_mb':1200,'selenium_max_load_per_cpu':1.35,
    'selenium_max_mem_psi':1.5,'selenium_max_io_psi':5.0,'selenium_max_io_full_psi':2.0,
    'selenium_max_swapout_pages_s':64,'selenium_swap_used_hard_pct':70
}.items():d.setdefault(k,v)
# v0.1.153: safety-critical Selenium profile. Force only concurrency/safety keys; keep unrelated user settings.
if int(d.get('selenium_safety_profile_version',0) or 0)<153:
    d['upstream_workers']=2
    d['selenium_max_active']=1
    d['selenium_lock_wait_seconds']=30
    d['selenium_load_wait_seconds']=45
    d['selenium_start_timeout_seconds']=25
    d['selenium_page_load_timeout_seconds']=35
    d['selenium_script_timeout_seconds']=90
    d['selenium_article_hard_timeout_seconds']=120
    d['selenium_instagram_hard_timeout_seconds']=30
    d['selenium_quit_timeout_seconds']=6
    d['selenium_recycle_after_operations']=6
    d['selenium_recycle_after_seconds']=240
    d['selenium_min_available_mb']=1200
    d['selenium_max_load_per_cpu']=1.35
    d['selenium_max_mem_psi']=1.5
    d['selenium_max_io_psi']=5.0
    d['selenium_max_io_full_psi']=2.0
    d['selenium_max_swapout_pages_s']=64
    d['selenium_swap_used_hard_pct']=70
    d['selenium_safety_profile_version']=153
# v0.1.153: HTTP upstream is kept at exactly two concurrent requests.
d['upstream_workers']=2
d['selenium_max_active']=1
# v0.1.123: publication/preparation maximum remains 500. Existing 300-setting is migrated too.
d['prefetch_newest_articles']=500
# v0.1.72: 旧既定(900px/Q70)だけを軽い本文プレビュー(720px/Q55)へ移行。
# 手動で別値に変更済みなら、その値は保持する。
if int(d.get('mobile_image_profile_version',0) or 0)<172:
    if int(d.get('mobile_image_max_width',900) or 900)==900:d['mobile_image_max_width']=720
    if int(d.get('mobile_image_quality',70) or 70)==70:d['mobile_image_quality']=55
    d['mobile_image_profile_version']=172
# v0.1.71: 以前の版では設定キー自体が無くInstagram事前取得が常時OFFだった。
# この移行を一度だけ強制ONし、以後ユーザーが変更した値は保持する。
if int(d.get('instagram_prefetch_profile_version',0) or 0)<164:
    d['instagram_prefetch_enabled']=True
    d['instagram_prefetch_profile_version']=164
# 旧配布版の既定1MB/sだけを高速プロファイルへ移行。手動で別値にした設定は保持する。
if int(d.get('performance_profile_version',0) or 0)<147:
    if float(d.get('prepare_download_mbps',1) or 1)==1:d['prepare_download_mbps']=4
    d['performance_profile_version']=147
dirname=os.path.dirname(p);fd,tmp=tempfile.mkstemp(prefix='.config.',suffix='.tmp',dir=dirname,text=True)
try:
    with os.fdopen(fd,'w',encoding='utf-8') as f:
        json.dump(d,f,ensure_ascii=False,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
    os.replace(tmp,p)
finally:
    try:os.unlink(tmp)
    except FileNotFoundError:pass
MOBILECFG
PORT=$(sudo python3 - <<'PY'
import json
try: print(int(json.load(open('/opt/rpi-matome/config.json')).get('port',8767) or 8767))
except: print(8767)
PY
)
sudo chown -R "$USER_NAME":"$(id -gn "$USER_NAME")" "$APP"

echo '[3/5] 閲覧用と低優先度の準備用サービスを作成'
sudo tee /etc/systemd/system/rpi-matome.service >/dev/null <<EOF
[Unit]
Description=RPi Matome Ready Article Server
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
sudo tee /etc/systemd/system/rpi-matome-prepare.service >/dev/null <<EOF
[Unit]
Description=RPi Matome Background Article Preparation
After=network-online.target rpi-matome.service
Wants=network-online.target
[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$APP
ExecStart=/usr/bin/python3 $APP/prepare_worker.py
Restart=on-failure
RestartSec=15
Nice=15
IOSchedulingClass=idle
CPUQuota=160%
CPUWeight=5
IOWeight=5
MemoryHigh=1100M
MemoryMax=1600M
MemorySwapMax=256M
OOMPolicy=kill
OOMScoreAdjust=700
TasksMax=160
KillMode=control-group
TimeoutStopSec=12
[Install]
WantedBy=multi-user.target
EOF

echo '[4/5] 起動'
sudo systemctl daemon-reload
sudo systemctl enable rpi-matome.service rpi-matome-prepare.service >/dev/null
sudo systemctl restart rpi-matome.service
sudo systemctl restart rpi-matome-prepare.service
echo '[5/5] 完了（初回準備中は完成した記事から順次表示）'
hostname -I | awk -v p="$PORT" '{for(i=1;i<=NF;i++) if($i ~ /^[0-9]+\./) print "  http://"$i":"p"/"}'
