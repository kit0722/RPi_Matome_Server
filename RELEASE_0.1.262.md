# RPi Matome Server v0.1.262 b262 (2026-10-19)

## KITツール事前検査の修正

2026-10-19 17:29の実機更新で、75件中74件が成功、1件だけ
`test_matometanews_replies.test_fragment_bundle_is_scoped_and_ordered`
が失敗してインストールを安全停止した。

原因: v0.1.261の1000mg対応で、記事rootの優先順が
`site1000mgRoot || matometaRoot || vipperRoot` になった一方、
テストは旧構文 `matometaRoot || vipperRoot` に固定されていた。
これはソースの抽出ロジックが壊れた証拠ではなく、テスト側の文字列判定漏れ。

修正:
- `test_matometanews_replies.py` を構文文字列の固定照合から、root式を取得して
  `matometaRoot` が `vipperRoot` と一般フォールバックより先にあることを
  検証する方式へ変更。将来別サイトの専用rootが追加されても検証意図を維持。
- `server.py`、`latest.json`、`UPDATE_ONLY.sh` を v0.1.262 b262 に統一。
- アプリ/サーバー処理・CSS/JS・キャッシュの内容・完成500件・新着300件・
  待機在庫・Yahooサービス・iPhone版・更新方法は変更なし。
- JavaScriptのアセット番号は変更不要（実装ファイルは変更していない）。

検証: 失敗箇所の新しい優先順位判定のPython模擬実行PASS、
版数整合を確認。Pi上での全75件の再試験と更新反映は未実施。
更新失敗後のPi稼働版はログ上 v0.1.259 b259、既存キャッシュは保持。
