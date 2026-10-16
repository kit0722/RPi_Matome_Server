# RPi Matome Server v0.1.244 b244 — 新着確定・待機自動補充・裏キャッシュ配信

基準: GitHub main v0.1.243。既存DB、記事本文、画像、GIF、共有既読状態は削除・初期化しない。

## 修正内容
- GET /api/new-buffer-state は本文一覧を返さず、5秒ポーリング用の新着件数・確定cutoff・最新時刻・裏待機完成数のみ返す。スマホ通信量とPiの負荷を削減。
- 新着ボタンから呼ぶ POST /api/consume-new-buffer は、受信済みの latest_new_release_time を through として受け取り、SQLiteトランザクションでその時刻までの新着だけ確定。再送しても二重消費しない。
- POST結果に「消費件数」「残り件数」「確定cutoff」「確定後の最新一覧」「準備状態」を同時に返す。iPhone側は確認応答前に新着0件へ切り替えない。
- 端末のWebタイマーが停止しても、ビューアーを使っている間はサーバー側で5秒ごとに最大2件を隠れ待機記事から新着へ公開。300件で古い100件を通常500件側へ繰上げる既存制御はそのまま。
- 新着に公開できる「待機完成済み」と、再準備中を含む「待機保持数」を別に表示。未完成を準備済み件数として水増ししない。
- GET /api/app-manifest?scope=all に通常500・新着最大300・設定済み隠れストック500〜3000の各完成済み記事を含める。非公開記事を端末に保存しても、新着へ自動公開しない。旧来の scope 指定なしAPIは最大500件のまま。
- 更新前に python3 -m py_compile と新規・既存 unittest を実行。不合格なら既存サービスの停止前に失敗し、データ保護。
- APIヘルス v0.1.244 b244 / new_buffer_ack:2 / standby_release_worker:true / hidden_manifest:true。

## 検査
```sh
python3 -m py_compile server.py ready_store.py
python3 -m unittest discover -s tests -v
```

Piで更新が反映されたら：
```sh
curl -fsS http://127.0.0.1:8767/api/health
curl -fsS http://127.0.0.1:8767/api/preparation-status
curl -fsS http://127.0.0.1:8767/api/standby-settings
```

## 重要
- Github反映だけではRaspberry Piの稼働コードは変わらない。Windowsキットツールまたは既存UPDATE_ONLY.shでユーザーが更新を実行して初めて反映。
- テストは一時SQLiteと一時記事ファイルだけで実施。現在のPi実機/システムd/実ネットワーク確認は別途必要。
- 記事が初期から1,800件未満しか準備できない時、存在しない裏記事を自動生成・表示しない。
- 待機補充が5秒ごと最大2件でも、3台の別端末が同時に押して記事数を固定保持することは保証しない。実際にある完成済み件数を優先する。
