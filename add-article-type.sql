-- =====================================================
-- article_type カラム追加スクリプト
-- =====================================================
-- このスクリプトをSupabaseのSQL Editorで実行してください
--
-- 目的: 記事の種類（自治会公式 or 地域情報）を区別するための
--       article_type カラムを追加します
-- =====================================================

-- article_type カラムを追加（デフォルトは 'official'）
ALTER TABLE articles
ADD COLUMN IF NOT EXISTS article_type TEXT NOT NULL DEFAULT 'official'
CHECK (article_type IN ('official', 'local-info'));

-- インデックスを追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_articles_article_type ON articles(article_type);

-- コメント追加（ドキュメント化）
COMMENT ON COLUMN articles.article_type IS '記事の種類: official=自治会公式, local-info=地域のお知らせ';

-- =====================================================
-- セットアップ完了！
-- =====================================================
-- 次のステップ:
-- 1. 実行が成功したか確認（エラーがないこと）
-- 2. 既存の記事は自動的に 'official' に設定されます
-- 3. 新規アップロード時に適切な article_type が設定されます
-- =====================================================
