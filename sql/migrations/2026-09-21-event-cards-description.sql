-- =====================================================
-- event_cards に紹介文(description) を追加
-- =====================================================
-- 週次LINE配信（docs/週次配信.md）の「⭐今週の一押し」に、タイトルの下へ
-- 1〜2行の紹介文を添えるための属性。抽出時に AI がチラシ・記事の内容説明から作り、
-- 抽出ダイアログ／予定カードの編集で手直しできる。公開側の予定ページ（/?event=<ID>）にも表示する。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 冪等: IF NOT EXISTS なので再実行しても安全。未適用でもアプリの登録は通る。
-- =====================================================

ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS description TEXT;
COMMENT ON COLUMN event_cards.description IS '紹介文（1〜2文・60字程度。週次配信の一押しと予定ページに表示）';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'event_cards' AND column_name IN ('description');
