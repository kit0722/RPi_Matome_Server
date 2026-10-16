# RPi Matome Server v0.1.246 b246 — 待機1,000件の在庫確保

## 修正
- 旧 prepare_worker.py にあった無条件の「5秒ごと最大2件放出」スレッドを廃止。
- 待機記事を新着へ移す自動処理を server.py の standby_release_pump だけに統一。閲覧アクティビティがない間は放出せず、裏の完成記事を蓄積する。
- 閲覧中は引き続き5秒ごと最大2件を新着へ補充する。300件上限、古い100件繰り上げ、消費確認、既存DB保護は変更しない。
- 待機設定1,000件は「上限・目標数」であって完了数ではない。GET /api/standby-settings に実際の standby_ready、standby_shortage、standby_replenishing、viewer_active を返す。
- 最新iPhone正式版 v0.1.72 b72 のままで接続互換あり。アプリ更新は不要。
- UPDATE_ONLY.sh の事前構文検査に prepare_worker.py を追加。既存の自動テストに1,000件在庫と放出スレッド一本化の回帰テストを追加。

## 背景
従来はprepare_worker側が常時放出し続けたため、画面を閉じていても裏在庫を消費していた。
待機が不足すると、単一ブラウザによる記事準備が終わるたびに1件ずつ新着が増えて見える。
この変更は「画面を閉じている間に完成済み記事を貯める」制御を回復するもので、供給の速度を超える無限の2件/5秒保証ではない。

## 検証条件
- `python3 -m py_compile server.py ready_store.py prepare_worker.py`
- `python3 -m unittest discover -s tests -v`
- `GET /api/health`: version 0.1.246、build 246、standby_release_owner viewer_server_only
- `GET /api/standby-settings`: standby_ready/standby_shortageの値と、閲覧を停止した際に在庫が減り続けないことをPi実機で確認
- Pi側の既存データ、設定、Yahooニュースに触れない。GitHub main更新だけではPiの実サービスへ反映されない。
