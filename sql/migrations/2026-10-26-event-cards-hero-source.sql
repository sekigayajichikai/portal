-- =====================================================
-- event_cards に画像の元の選択 hero_source を追加
-- =====================================================
-- 週次配信の一押しカードに載せる画像の元を人が選べるようにする。
--   'pdf'            = 由来PDF（チラシ）の1ページ目
--   'photo'          = リンク記事の写真（扉写真 → 画像添付の先頭）
--   'newsletter_pdf' = 出典号の先頭PDF（代用）
--   NULL             = 自動（チラシ → 記事の写真 → 号の先頭PDF の順。従来どおり）
-- 「詳しく見る」のリンク先（配信日ごとの下書き）とは独立。切り抜き hero_crop と同じく予定カードに残す。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 冪等: IF NOT EXISTS なので再実行しても安全。
-- =====================================================

ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS hero_source TEXT
  CHECK (hero_source IS NULL OR hero_source IN ('pdf', 'photo', 'newsletter_pdf'));
COMMENT ON COLUMN event_cards.hero_source IS '一押しカードの画像の元 pdf / photo / newsletter_pdf（NULL=自動）';

SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'event_cards' AND column_name IN ('hero_source', 'hero_crop');
