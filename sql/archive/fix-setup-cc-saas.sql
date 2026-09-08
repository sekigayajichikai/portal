-- =====================================================
-- CC-SaaS セットアップ修正スクリプト（full-setup の後に実行）
-- =====================================================
-- 既存の古いスキーマとの差分を埋めます:
-- 1. 足りないカラムを追加（既存データは壊しません）
-- 2. organization_id / created_by を TEXT 型に変更
--    （アプリが 'org1' のような文字列を渡すため）
-- 3. RLSポリシーを追加（新しいSupabaseはRLSが既定で有効なため、
--    アプリのanonキーからの読み書きを許可）
-- 4. インデックスとストレージバケットを作成
--
-- すべて冪等（再実行しても安全）です。
-- =====================================================

-- =====================================================
-- 1. newsletters: 足りないカラムを追加
-- =====================================================
ALTER TABLE newsletters
  ADD COLUMN IF NOT EXISTS source_pdf_urls JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES newsletters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS digest_audio_url TEXT,
  ADD COLUMN IF NOT EXISTS digest_audio_filename TEXT,
  ADD COLUMN IF NOT EXISTS review_status TEXT CHECK (review_status IN ('pending', 'approved', 'changes_requested')),
  ADD COLUMN IF NOT EXISTS review_token TEXT,
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS review_comment TEXT,
  ADD COLUMN IF NOT EXISTS reviewer_name TEXT;

-- =====================================================
-- 2. articles: 足りないカラムを追加
-- =====================================================
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS article_type TEXT NOT NULL DEFAULT 'official',
  ADD COLUMN IF NOT EXISTS control_date DATE,
  ADD COLUMN IF NOT EXISTS event_date DATE,
  ADD COLUMN IF NOT EXISTS event_time TEXT,
  ADD COLUMN IF NOT EXISTS event_location TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_fit TEXT,
  ADD COLUMN IF NOT EXISTS image_display TEXT;

-- =====================================================
-- 3. organization_id / created_by を TEXT に統一
-- =====================================================
ALTER TABLE newsletters ALTER COLUMN organization_id TYPE TEXT USING organization_id::text;
ALTER TABLE newsletters ALTER COLUMN created_by TYPE TEXT USING created_by::text;
ALTER TABLE articles ALTER COLUMN organization_id TYPE TEXT USING organization_id::text;
ALTER TABLE pending_images ALTER COLUMN organization_id TYPE TEXT USING organization_id::text;
ALTER TABLE publishers ALTER COLUMN organization_id TYPE TEXT USING organization_id::text;
ALTER TABLE radio_programs ALTER COLUMN organization_id TYPE TEXT USING organization_id::text;
ALTER TABLE bus_schedules ALTER COLUMN organization_id TYPE TEXT USING organization_id::text;

-- =====================================================
-- 4. RLSポリシー（アプリのanonキーでの読み書きを許可）
-- =====================================================
-- このアプリはSupabase Authを使わない共有パスワード方式のため、
-- 旧環境と同様にanonキーでの全操作を許可します。

ALTER TABLE newsletters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app full access" ON newsletters;
CREATE POLICY "app full access" ON newsletters
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app full access" ON articles;
CREATE POLICY "app full access" ON articles
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE pending_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app full access" ON pending_images;
CREATE POLICY "app full access" ON pending_images
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE publishers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app full access" ON publishers;
CREATE POLICY "app full access" ON publishers
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE event_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app full access" ON event_cards;
CREATE POLICY "app full access" ON event_cards
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE article_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app full access" ON article_likes;
CREATE POLICY "app full access" ON article_likes
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE radio_programs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app full access" ON radio_programs;
CREATE POLICY "app full access" ON radio_programs
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE bus_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app full access" ON bus_schedules;
CREATE POLICY "app full access" ON bus_schedules
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- 5. 発行元の初期データ（なければ追加）
-- =====================================================
INSERT INTO publishers (name, display_order) VALUES
  ('関ヶ谷だより', 1),
  ('会報ふれあい', 2)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 6. インデックス
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_newsletters_created_at ON newsletters(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletters_review_token ON newsletters(review_token) WHERE review_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_articles_newsletter_id ON articles(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_priority ON articles(priority);
CREATE INDEX IF NOT EXISTS idx_pending_images_newsletter ON pending_images(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_event_cards_newsletter_id ON event_cards(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_article_likes_article_id ON article_likes(article_id);
CREATE INDEX IF NOT EXISTS idx_radio_programs_newsletter_id ON radio_programs(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_bus_schedules_is_active ON bus_schedules(is_active);

-- =====================================================
-- 7. ストレージバケット + ポリシー
-- =====================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('newsletters', 'newsletters', true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('newsletter-images', 'newsletter-images', true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('radio', 'radio', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon upload newsletters" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon update newsletters" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon delete newsletters" ON storage.objects;

CREATE POLICY "Public Access"
ON storage.objects FOR SELECT USING (bucket_id = 'newsletters');
CREATE POLICY "Allow anon upload newsletters"
ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'newsletters');
CREATE POLICY "Allow anon update newsletters"
ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'newsletters');
CREATE POLICY "Allow anon delete newsletters"
ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'newsletters');

DROP POLICY IF EXISTS "Public Access newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous upload newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous update newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous delete newsletter images" ON storage.objects;

CREATE POLICY "Public Access newsletter images"
ON storage.objects FOR SELECT USING (bucket_id = 'newsletter-images');
CREATE POLICY "Allow anonymous upload newsletter images"
ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'newsletter-images');
CREATE POLICY "Allow anonymous update newsletter images"
ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'newsletter-images');
CREATE POLICY "Allow anonymous delete newsletter images"
ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'newsletter-images');

DROP POLICY IF EXISTS "Public read access for radio files" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon upload radio" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon update radio" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon delete radio" ON storage.objects;

CREATE POLICY "Public read access for radio files"
ON storage.objects FOR SELECT USING (bucket_id = 'radio');
CREATE POLICY "Allow anon upload radio"
ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'radio');
CREATE POLICY "Allow anon update radio"
ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'radio');
CREATE POLICY "Allow anon delete radio"
ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'radio');

-- =====================================================
-- 修正完了！
-- =====================================================
