-- =====================================================
-- CC-SaaS データベースセットアップスクリプト
-- =====================================================
-- このスクリプトをSupabaseのSQL Editorで実行してください
--
-- 実行手順:
-- 1. Supabaseダッシュボード (https://supabase.com) にログイン
-- 2. プロジェクトを選択
-- 3. 左メニューから「SQL Editor」を開く
-- 4. 「New query」をクリック
-- 5. このスクリプト全体をコピー＆ペースト
-- 6. 「Run」ボタンをクリック
-- =====================================================

-- デジタル回覧板テーブル（月号管理）
CREATE TABLE IF NOT EXISTS newsletters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID,
  title TEXT NOT NULL,
  issue_date DATE NOT NULL,
  source_pdf_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  published_at TIMESTAMP WITH TIME ZONE
);

-- 記事テーブル（PDFから抽出された記事）
CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsletter_id UUID REFERENCES newsletters(id) ON DELETE CASCADE,
  organization_id UUID,

  -- 基本情報
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  deadline DATE,

  -- 4段階要約（Claude AIが生成）
  headline TEXT NOT NULL,
  brief TEXT NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,

  -- メタ情報
  tags TEXT[] DEFAULT '{}',
  visibility TEXT DEFAULT 'members-only' CHECK (visibility IN ('public', 'members-only', 'board-only')),
  source TEXT,
  attachments JSONB DEFAULT '[]',

  -- 表示制御
  display_order INTEGER,
  is_pinned BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_articles_newsletter_id ON articles(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_newsletters_created_at ON newsletters(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_priority ON articles(priority);

-- コメント追加（ドキュメント化）
COMMENT ON TABLE newsletters IS 'デジタル回覧板（月号）を管理するテーブル';
COMMENT ON TABLE articles IS 'PDFから抽出された記事を保存するテーブル';

COMMENT ON COLUMN newsletters.title IS 'デジタル回覧板のタイトル（例: 2025年1月号）';
COMMENT ON COLUMN newsletters.status IS 'ステータス: draft=下書き, published=公開済み, archived=アーカイブ';
COMMENT ON COLUMN articles.headline IS '5文字以内の見出し';
COMMENT ON COLUMN articles.brief IS '15文字程度の要約';
COMMENT ON COLUMN articles.summary IS '40文字程度の詳細要約';
COMMENT ON COLUMN articles.content IS '記事の全文（Markdown形式）';

-- =====================================================
-- セットアップ完了！
-- =====================================================
-- 次のステップ:
-- 1. 実行が成功したか確認（エラーがないこと）
-- 2. 左メニューの「Table Editor」でテーブルが作成されたことを確認
-- 3. アプリケーションから保存機能を試してみる
-- =====================================================
