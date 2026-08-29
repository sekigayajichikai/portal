-- =====================================================
-- CC-SaaS 完全セットアップスクリプト（プロジェクト再構築用）
-- =====================================================
-- 「CC-SaaS Dev」削除に伴い、新プロジェクト（CC-SaaS）に
-- アプリが必要とする全テーブル・ストレージを一括作成します。
--
-- 実行手順:
-- 1. Supabaseダッシュボードで CC-SaaS プロジェクトを開く
-- 2. 左メニュー「SQL Editor」→「New query」
-- 3. このファイル全体をコピー＆ペーストして「Run」
--
-- すべて IF NOT EXISTS / ON CONFLICT 付きなので再実行しても安全です。
--
-- 注意: organization_id / created_by は歴史的経緯でアプリが
-- 'org1' のような文字列を渡すため TEXT 型にしています。
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. 回覧板（月号）テーブル
-- =====================================================
CREATE TABLE IF NOT EXISTS newsletters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id TEXT,
  title TEXT NOT NULL,
  issue_date DATE NOT NULL,
  source_pdf_url TEXT,
  source_pdf_urls JSONB DEFAULT '[]',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  published_at TIMESTAMP WITH TIME ZONE,
  parent_id UUID REFERENCES newsletters(id) ON DELETE SET NULL,

  -- ダイジェスト音声
  digest_audio_url TEXT,
  digest_audio_filename TEXT,

  -- 公開前の担当者確認（承認フロー）
  review_status TEXT CHECK (review_status IN ('pending', 'approved', 'changes_requested')),
  review_token TEXT,
  review_requested_at TIMESTAMP WITH TIME ZONE,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_comment TEXT,
  reviewer_name TEXT
);

COMMENT ON TABLE newsletters IS 'デジタル回覧板（月号）を管理するテーブル';
COMMENT ON COLUMN newsletters.status IS 'draft=下書き, published=公開済み, archived=アーカイブ';
COMMENT ON COLUMN newsletters.review_status IS '確認状況: NULL=未依頼, pending=確認待ち, approved=承認済み, changes_requested=修正依頼';
COMMENT ON COLUMN newsletters.review_token IS '担当者確認ページ(/review/<token>)用トークン';

-- =====================================================
-- 2. 記事テーブル
-- =====================================================
CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsletter_id UUID REFERENCES newsletters(id) ON DELETE CASCADE,
  organization_id TEXT,

  -- 基本情報
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  article_type TEXT NOT NULL DEFAULT 'official' CHECK (article_type IN ('official', 'local-info')),
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  control_date DATE,

  -- イベント情報（category=eventの場合にAIが自動入力）
  event_date DATE,
  event_time TEXT,
  event_location TEXT,

  -- 4段階要約（AIが生成）
  headline TEXT NOT NULL,
  brief TEXT NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,

  -- メタ情報
  tags TEXT[] DEFAULT '{}',
  visibility TEXT DEFAULT 'members-only' CHECK (visibility IN ('public', 'members-only', 'board-only')),
  source TEXT,
  attachments JSONB DEFAULT '[]',
  thumbnail_url TEXT,
  thumbnail_fit TEXT,
  image_display TEXT,

  -- 表示制御
  display_order INTEGER,
  is_pinned BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE articles IS 'PDFから抽出された記事を保存するテーブル';

-- =====================================================
-- 3. 保留画像テーブル（PDF抽出画像の記事紐付け管理）
-- =====================================================
CREATE TABLE IF NOT EXISTS pending_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsletter_id UUID REFERENCES newsletters(id) ON DELETE CASCADE,
  organization_id TEXT,

  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  caption TEXT,
  page_number INTEGER,
  position_info JSONB,

  detected_context TEXT,
  suggested_article_ids UUID[],
  confidence_score FLOAT,

  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'rejected')),
  assigned_to_article_id UUID REFERENCES articles(id) ON DELETE SET NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_at TIMESTAMP WITH TIME ZONE
);

-- =====================================================
-- 4. 発行元マスター
-- =====================================================
CREATE TABLE IF NOT EXISTS publishers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id TEXT,
  name TEXT NOT NULL UNIQUE,
  short_name TEXT,
  display_order INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 初期データ（アプリの設定画面から変更可能）
INSERT INTO publishers (name, display_order) VALUES
  ('関ヶ谷だより', 1),
  ('会報ふれあい', 2)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 5. イベントカード
-- =====================================================
CREATE TABLE IF NOT EXISTS event_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsletter_id UUID REFERENCES newsletters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_date DATE,
  event_time TEXT,
  event_location TEXT,
  linked_article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 6. いいね（端末IDベース）
-- =====================================================
CREATE TABLE IF NOT EXISTS article_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (article_id, device_id)
);

-- =====================================================
-- 7. ラジオ番組
-- =====================================================
CREATE TABLE IF NOT EXISTS radio_programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsletter_id UUID REFERENCES newsletters(id) ON DELETE CASCADE,
  organization_id TEXT,

  title TEXT NOT NULL,
  description TEXT,
  duration_seconds INTEGER,

  script TEXT NOT NULL,
  audio_url TEXT,
  audio_filename TEXT,

  generation_status TEXT DEFAULT 'pending' CHECK (generation_status IN ('pending', 'generating', 'completed', 'failed')),
  generation_error TEXT,
  generated_at TIMESTAMP WITH TIME ZONE,

  article_count INTEGER,
  segment_count INTEGER,
  model_version TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 8. バス時刻表
-- =====================================================
CREATE TABLE IF NOT EXISTS bus_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id TEXT,

  route_name TEXT NOT NULL,
  stop_name TEXT NOT NULL,
  destination TEXT,

  schedule_data JSONB NOT NULL,

  source_pdf_url TEXT,
  valid_from DATE,
  valid_until DATE,
  notes TEXT,

  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 9. インデックス
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_newsletters_created_at ON newsletters(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletters_review_token ON newsletters(review_token) WHERE review_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_articles_newsletter_id ON articles(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_article_type ON articles(article_type);
CREATE INDEX IF NOT EXISTS idx_articles_priority ON articles(priority);
CREATE INDEX IF NOT EXISTS idx_pending_images_newsletter ON pending_images(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_pending_images_status ON pending_images(status);
CREATE INDEX IF NOT EXISTS idx_event_cards_newsletter_id ON event_cards(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_article_likes_article_id ON article_likes(article_id);
CREATE INDEX IF NOT EXISTS idx_radio_programs_newsletter_id ON radio_programs(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_bus_schedules_is_active ON bus_schedules(is_active);

-- =====================================================
-- 10. ストレージバケット + ポリシー
-- =====================================================
-- アプリはSupabase Authを使わない（共有パスワード方式）ため、
-- anonキーでのアップロードを許可します（旧環境と同じ構成）。

INSERT INTO storage.buckets (id, name, public) VALUES ('newsletters', 'newsletters', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('newsletter-images', 'newsletter-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('radio', 'radio', true)
ON CONFLICT (id) DO NOTHING;

-- newsletters バケット（PDF・音声）
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon upload newsletters" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon update newsletters" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon delete newsletters" ON storage.objects;

CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'newsletters');

CREATE POLICY "Allow anon upload newsletters"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'newsletters');

CREATE POLICY "Allow anon update newsletters"
ON storage.objects FOR UPDATE TO anon, authenticated
USING (bucket_id = 'newsletters');

CREATE POLICY "Allow anon delete newsletters"
ON storage.objects FOR DELETE TO anon, authenticated
USING (bucket_id = 'newsletters');

-- newsletter-images バケット（記事画像）
DROP POLICY IF EXISTS "Public Access newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous upload newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous update newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous delete newsletter images" ON storage.objects;

CREATE POLICY "Public Access newsletter images"
ON storage.objects FOR SELECT
USING (bucket_id = 'newsletter-images');

CREATE POLICY "Allow anonymous upload newsletter images"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'newsletter-images');

CREATE POLICY "Allow anonymous update newsletter images"
ON storage.objects FOR UPDATE TO anon, authenticated
USING (bucket_id = 'newsletter-images');

CREATE POLICY "Allow anonymous delete newsletter images"
ON storage.objects FOR DELETE TO anon, authenticated
USING (bucket_id = 'newsletter-images');

-- radio バケット（ラジオ音声）
DROP POLICY IF EXISTS "Public read access for radio files" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon upload radio" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon update radio" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon delete radio" ON storage.objects;

CREATE POLICY "Public read access for radio files"
ON storage.objects FOR SELECT
USING (bucket_id = 'radio');

CREATE POLICY "Allow anon upload radio"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'radio');

CREATE POLICY "Allow anon update radio"
ON storage.objects FOR UPDATE TO anon, authenticated
USING (bucket_id = 'radio');

CREATE POLICY "Allow anon delete radio"
ON storage.objects FOR DELETE TO anon, authenticated
USING (bucket_id = 'radio');

-- =====================================================
-- セットアップ完了！
-- =====================================================
-- 確認:
-- 1. Table Editor に newsletters / articles / pending_images /
--    publishers / event_cards / article_likes / radio_programs /
--    bus_schedules が存在すること
-- 2. Storage に newsletters / newsletter-images / radio バケットが
--    存在すること
-- =====================================================
