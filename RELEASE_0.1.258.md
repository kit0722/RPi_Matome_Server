# RPi Matome Server v0.1.258 b258 — 2026-10-19

## 修正内容
Kitツールからの v0.1.257 更新が事前検査58件中2件で中止された件を修正。

- test_cross_site_video.py に残っていた古い prepare_snapshot.js?v=0282 の固定チェックを解消（実HTMLは0283）。
- test_video_poster_links.py に残っていた古い reader.js?v=0301 の固定チェックを解消（実HTMLは0302）。
- 検査対象のHTMLからJS/CSSの実際のバージョン文字列を読み取り、更新ゲートと照合する仕組みに変更。次のリリースで版数が変わってもテストだけが古い番号を期待しない。
- 同様の固定番号検査を test_reply1_media_integrity.py / test_video_fallback_links.py / test_reader_controls.py からも解消。
- server.py、latest.json、UPDATE_ONLY.sh の版数・ビルドを v0.1.258 b258 に統一。

## 保持
記事抽出・再生・レス1復元・X画像取得コード、500件/新着300件/待機在庫、SQLiteキャッシュ、ユーザー設定、Piサービス起動設定、Yahooニュースを変更していません。

## 検証
以前失敗した2件のHTML・更新ゲート照合をソース上で再確認してPASS。全PythonテストスイートとPi更新は今回未実施。Pi稼働版は更新成功が確認されるまでv0.1.254のまま。
