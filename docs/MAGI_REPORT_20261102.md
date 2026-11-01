# まとめサーバー MAGI安全レポート（2026-11-02）
- 基準main `3d6c4470691e29f86739ee22ea9065b58d584fed`、現行 `0.1.263 b263`。
- 既存の `tests/test_release_metadata.py` はバージョンの固定化ではなく `latest.json`、server.py、UPDATE_ONLY.shの整合を要求する安全な更新ゲート。緩和せず維持。
- `tools/check_magi.sh` は既存のrelease、atomic buffer、new buffer、fresh standby回帰を6項目に分けてJSON報告。実行失敗・SKIPはPASSにしない。
- テストはローカルの一時SQLiteを使う独立試験。実運用のPi DB、サービス、ダウンロードは変更しない。
- 最終MAGI全6件の本ブランチ実行は未確認。稼働中サーバー・Piサービス・正式mainは無変更。
