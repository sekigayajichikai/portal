-- =====================================================
-- 保留画像テーブルセットアップスクリプト
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

-- 保留画像テーブル（Newsletter ごとに画像を管理）
CREATE TABLE IF NOT EXISTS pending_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsletter_id UUID REFERENCES newsletters(id) ON DELETE CASCADE,
  organization_id UUID,

  -- 画像情報
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  caption TEXT,
  page_number INTEGER,
  position_info JSONB, -- { x, y, width, height } など

  -- AI検出情報
  detected_context TEXT, -- Claudeが検出した周辺テキスト
  suggested_article_ids UUID[], -- AIが推奨する記事ID
  confidence_score FLOAT, -- 0.0-1.0 の確信度

  -- ステータス
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'rejected')),
  assigned_to_article_id UUID REFERENCES articles(id) ON DELETE SET NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_at TIMESTAMP WITH TIME ZONE
);

-- インデックス作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_pending_images_newsletter ON pending_images(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_pending_images_status ON pending_images(status);
CREATE INDEX IF NOT EXISTS idx_pending_images_assigned_article ON pending_images(assigned_to_article_id);

-- コメント追加（ドキュメント化）
COMMENT ON TABLE pending_images IS 'PDFから抽出された画像で、記事への紐付けが保留中のもの';
COMMENT ON COLUMN pending_images.newsletter_id IS '画像が属するNewsletterのID';
COMMENT ON COLUMN pending_images.image_url IS '画像の公開URL';
COMMENT ON COLUMN pending_images.storage_path IS 'Storageバケット内の相対パス';
COMMENT ON COLUMN pending_images.caption IS '画像のキャプション（Claude AIが検出）';
COMMENT ON COLUMN pending_images.page_number IS 'PDFのページ番号';
COMMENT ON COLUMN pending_images.detected_context IS '画像周辺のテキスト（前後3行程度）';
COMMENT ON COLUMN pending_images.suggested_article_ids IS 'AIが推奨する記事IDの配列';
COMMENT ON COLUMN pending_images.confidence_score IS '記事との関連性の確信度（0.0-1.0）';
COMMENT ON COLUMN pending_images.status IS 'pending=保留中, assigned=紐付け完了, rejected=却下';
COMMENT ON COLUMN pending_images.assigned_to_article_id IS '紐付けられた記事のID';

-- =====================================================
-- セットアップ完了！
-- =====================================================
-- 次のステップ:
-- 1. 実行が成功したか確認（エラーがないこと）
-- 2. 左メニューの「Table Editor」でテーブルが作成されたことを確認
-- 3. newsletter-images-storage-setup.sql を実行してStorageバケットを作成
-- =====================================================
