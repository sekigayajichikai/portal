-- =====================================================
-- event_cards に申込締切(apply_deadline) を追加
-- =====================================================
-- 週次LINE配信（docs/週次配信.md）で「申込受付中」「締切間近」を組むための属性。
--   apply_deadline … 申込締切日（要予約イベント）。不明なら NULL（配信側で開催7日前を仮締切にする）
--   ※ first_come（先着順）は 2026-09-08 に廃止。既に列を作ってしまった場合も残して害はない
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 冪等: IF NOT EXISTS なので再実行しても安全。未適用でもアプリの登録は通る。
-- =====================================================

ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS apply_deadline DATE;
COMMENT ON COLUMN event_cards.apply_deadline IS '申込締切日（要予約イベント）。不明なら NULL';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'event_cards' AND column_name IN ('apply_deadline');
