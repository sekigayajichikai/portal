# sql/ — 本番 Supabase（iplc = sekigaya-portal）の DB 定義

SQL は Supabase ダッシュボードの SQL Editor に貼り付けて手動実行する（マイグレーションツールは使っていない）。

| 場所 | 用途 |
|---|---|
| `schema/full-setup-cc-saas.sql` | 新しい環境をゼロから作るときの全テーブル定義。最新の列（kind / apply_deadline / target_audience など）を含む |
| `migrations/2026-*.sql` | 既存環境に後から足した変更。**ファイル名の日付順に実行**する。`IF NOT EXISTS` なので再実行しても安全 |
| `storage/newsletter-images-storage-setup-prod.sql` | 画像・PDF 用バケット `newsletter-images` の作成とポリシー |
| `storage/pending-images-setup.sql` | 抽出画像の一時保管テーブル |
| `archive/` | 旧環境向けの統合スクリプトや dev/prod の重複版。現在は使わない |

最近のマイグレーション: `2026-09-24-weekly-digest-drafts.sql`（週次配信の下書き。2026-09-24 に Supabase MCP で本番適用済み）。

適用済みかどうかは、アプリの登録処理が「未追加の列を外して再試行」するため、動作からは分かりにくい。
確認するときは各マイグレーション末尾の `SELECT column_name ...` を SQL Editor で実行する。
