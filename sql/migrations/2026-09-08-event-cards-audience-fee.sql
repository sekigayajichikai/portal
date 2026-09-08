-- =====================================================
-- event_cards に対象者(target_audience)・参加費(fee) を追加
-- =====================================================
-- 週次LINE配信（docs/週次配信.md）で「⭐一押し」「📝申込受付中」の行に
-- 「（65歳以上・無料）」のように添えるための属性。抽出時に PDF から拾う。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 冪等: IF NOT EXISTS なので再実行しても安全。未適用でもアプリの登録は通る。
-- =====================================================

ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS target_audience TEXT;
COMMENT ON COLUMN event_cards.target_audience IS '対象者（例: 65歳以上 / 乳幼児と保護者 / 成人）';

ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS fee TEXT;
COMMENT ON COLUMN event_cards.fee IS '参加費（例: 無料 / 400円/回 / 3,200円（2回分））';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'event_cards' AND column_name IN ('target_audience', 'fee');
