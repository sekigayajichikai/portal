-- =====================================================
-- event_cards に「週次配信に載せない」(digest_exclude) を追加
-- =====================================================
-- 役員会議・監査・実行委員会など、一般住民向けでない予定を週次配信（docs/週次配信.md）から外すためのフラグ。
-- 抽出時に AI が目安を付け、抽出ダイアログ／予定カードの編集／週次配信画面の「今後も載せない」で人が付け外しする。
-- 公開カレンダー（今後のイベント）の表示には影響しない。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run（2026-09-21 に MCP で適用済み）
-- 冪等: IF NOT EXISTS なので再実行しても安全。未適用でもアプリの登録は通る。
-- =====================================================

ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS digest_exclude BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN event_cards.digest_exclude IS '週次配信（今週のお知らせ）に載せない（役員向け会議など）';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'event_cards' AND column_name IN ('digest_exclude');
