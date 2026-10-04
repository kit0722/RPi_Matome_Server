#!/bin/bash
cd "$(dirname "$0")"
sudo systemctl status rpi-matome.service rpi-matome-prepare.service --no-pager -l
PORT=$(python3 -c 'import json; print(json.load(open("config.json")).get("port",8767))')
curl -fsS "http://127.0.0.1:${PORT}/api/preparation-status" | python3 -m json.tool
