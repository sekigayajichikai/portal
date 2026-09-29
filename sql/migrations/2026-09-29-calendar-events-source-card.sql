-- =====================================================
-- calendar_events に source_event_card_id を追加（回覧板の予定カードとの紐づけ）
-- =====================================================
-- 回覧板ポータル（CC-SaaS）の予定タブから「カレンダーに反映」で calendar_events に書けるようにする。
-- 同じ予定を何度も流しても二重にならないよう、どの予定カードから作られたかを記録する。
--
-- 背景: 以前は CC-SaaS と book-system（カレンダー）が別々の Supabase だったため、
-- 「JSONをコピー→カレンダー側の画面に貼る→承認」という手作業の連携だった（general_import_rows）。
-- 2026-09 に本番DBを統合して同じプロジェクト（iplc）になったので、回覧板側から直接書けるようにする。
-- カレンダーアプリ側のコードは、この列を知らなくてもそのまま動く（列が増えるだけ）。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 冪等: IF NOT EXISTS なので再実行しても安全。
-- =====================================================

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS source_event_card_id UUID;

COMMENT ON COLUMN calendar_events.source_event_card_id IS
  '回覧板ポータルの予定カード（event_cards.id）から作られた場合の出どころ。二重登録を防ぐために使う';

CREATE INDEX IF NOT EXISTS idx_calendar_events_source_card ON calendar_events (source_event_card_id);

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'calendar_events' AND column_name = 'source_event_card_id';
