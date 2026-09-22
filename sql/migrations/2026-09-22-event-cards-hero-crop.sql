-- =====================================================
-- event_cards にチラシ画像の切り出し位置(hero_crop_y) を追加
-- =====================================================
-- 週次配信（docs/週次配信.md）の一押しカードに載せるチラシ画像は、縦長チラシから正方形を切り出す。
-- その位置（0=上端〜1=下端。横長なら左〜右）を人が決めて保存できるようにする。null は上端。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run（2026-09-22 に MCP で適用済み）
-- 冪等: IF NOT EXISTS なので再実行しても安全。
-- =====================================================

ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS hero_crop_y REAL;
COMMENT ON COLUMN event_cards.hero_crop_y IS '一押しカードのチラシ画像の切り出し位置（0=上端〜1=下端）';

SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'event_cards' AND column_name = 'hero_crop_y';
