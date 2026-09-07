-- =====================================================
-- event_cards に性質(kind)・週次配信トピック(weekly_topic)・根拠(topic_reason) を追加
-- =====================================================
-- カレンダー抽出 v4（docs/カレンダー抽出ルール.md）で追加した項目。
--   kind          … 'community'(地域交流の催し) / 'support'(福祉・健康支援の案内) / 'class'(定例教室・講座) / NULL
--   weekly_topic  … 週次LINE配信で取り上げる候補か（1枚ものチラシ・複数掲載・AI判定から。人が確認して確定）
--   topic_reason  … weekly_topic の根拠（例: 単独チラシ / 複数掲載 / 年1回の芸術祭）
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 冪等: IF NOT EXISTS なので再実行しても安全。
-- 未適用でもアプリの登録は通る（addEventCard が未追加列を外して再試行する）。
-- =====================================================

ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS kind TEXT;
COMMENT ON COLUMN event_cards.kind IS 'イベントの性質: community(地域交流の催し) / support(福祉・健康支援の案内) / class(定例教室・講座) / NULL';

ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS weekly_topic BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN event_cards.weekly_topic IS '週次LINE配信のトピック候補（1枚ものチラシ・複数掲載・AI判定。人が確認して確定）';

ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS topic_reason TEXT;
COMMENT ON COLUMN event_cards.topic_reason IS 'weekly_topic の根拠（例: 単独チラシ / 複数掲載 / 年1回の芸術祭）';

-- 確認
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'event_cards' AND column_name IN ('kind', 'weekly_topic', 'topic_reason');
