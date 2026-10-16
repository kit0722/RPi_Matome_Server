# 2chまとめサーバー v0.1.247 b247

- 通常記事の文字サイズ「－／＋」をiPhone、iPad、PCで常時表示。従来CSSのdisplay:none設定に負けないスタイルへ変更。
- reader.htmlのCSSキャッシュキーを更新。文字サイズボタンは既存の保存値を変更し、表示に反映。
- GET /api/new-buffer-stateに待機実数とrefill_state（standby_empty／buffer_full／ready）を追加。新着が増えない理由を在庫不足・満杯・補充側の問題に切り分け可能。
- latest.json、/api/health、更新スクリプトをv0.1.247に統一。
- tests/test_reader_controls.pyを追加。旧来の300件スライド・新着確定・待機在庫テストも維持。
- iPhone側の保存済み本文だけを直接開く画面は、iPhoneアプリ v0.1.73 b73 にて「－／＋」を追加。Piだけを更新しても既にインストール済みの古いIPAの保存済み画面は変わらない。
- Pi側の記事・画像・DB・設定・Yahooニュースデータは初期化しない。

更新後に稼働状態と待機在庫を確認：

    curl -fsS http://127.0.0.1:8767/api/health
    curl -fsS http://127.0.0.1:8767/api/standby-settings
    curl -fsS http://127.0.0.1:8767/api/new-buffer-state

待機在庫が0なら2件ずつ移すことはできず、記事準備ワーカーが律速。待機在庫が2件以上で閲覧中にもかかわらず増えない場合はサービスログを調査する。実機の在庫数とiPhone動作は未検証。
