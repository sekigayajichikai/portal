-- =====================================================
-- event_cards の画像切り出しを hero_crop (JSONB) に
-- =====================================================
-- 週次配信の一押しカードに載せる画像（チラシPDFの1ページ目、または記事の写真）の切り出しを
-- 「位置 x,y（0〜1）＋拡大率 scale（1〜3）」で保存する。hero_crop_y（位置だけ）はそのまま残す（旧データ用）。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run（2026-09-22 に MCP で適用済み）
-- 冪等: IF NOT EXISTS なので再実行しても安全。
-- =====================================================

ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS hero_crop JSONB;
COMMENT ON COLUMN event_cards.hero_crop IS '一押しカードの画像の切り出し {x,y:0〜1, scale:1〜3}';

SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'event_cards' AND column_name IN ('hero_crop', 'hero_crop_y');
