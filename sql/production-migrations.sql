-- =====================================================
-- 本番環境用マイグレーションスクリプト（統合版）
-- =====================================================
-- このスクリプトは、DEV環境で実行済みだが本番環境で未実行のマイグレーションを
-- まとめて実行するための統合スクリプトです。
--
-- 【対象マイグレーション】
-- 1. ダイジェスト音声機能（add-digest-audio-columns.sql）
-- 2. 記事サムネイル機能（add-thumbnail-column.sql）
-- 3. 保留画像管理テーブル（pending-images-setup.sql）
-- 4. Newsletter画像ストレージ（newsletter-images-storage-setup-prod.sql）
--
-- 【冪等性について】
-- すべてのSQL文に IF NOT EXISTS または ON CONFLICT を使用しているため、
-- 一部実行済みでも安全に再実行できます。
--
-- 【実行手順】
-- 1. Supabaseダッシュボード（本番環境）にログイン
--    https://supabase.com
-- 2. 本番用プロジェクトを選択
-- 3. 左メニューから「SQL Editor」を開く
-- 4. 「New query」をクリック
-- 5. このスクリプト全体をコピー＆ペースト
-- 6. 「Run」ボタンをクリック
-- 7. エラーがないことを確認
--
-- 【実行後の確認】
-- ✅ Table Editorで以下を確認:
--    - newsletters テーブルに digest_audio_url, digest_audio_filename カラムが存在
--    - articles テーブルに thumbnail_url カラムが存在
--    - pending_images テーブルが作成されている
-- ✅ Storageで newsletter-images バケットが作成されている
-- =====================================================

-- =====================================================
-- マイグレーション 1: ダイジェスト音声機能
-- =====================================================
-- newslettersテーブルにダイジェスト版音声ファイルの
-- URLとファイル名を保存するカラムを追加します。
-- =====================================================

-- newslettersテーブルにダイジェスト音声カラムを追加
ALTER TABLE newsletters 
ADD COLUMN IF NOT EXISTS digest_audio_url TEXT,
ADD COLUMN IF NOT EXISTS digest_audio_filename TEXT;

-- コメント追加（ドキュメント化）
COMMENT ON COLUMN newsletters.digest_audio_url IS 'ダイジェスト版音声ファイルの公開URL';
COMMENT ON COLUMN newsletters.digest_audio_filename IS 'ダイジェスト版音声ファイルの元のファイル名';

-- =====================================================
-- マイグレーション 2: 記事サムネイル機能
-- =====================================================
-- articlesテーブルにサムネイル画像URLを保存する
-- カラムを追加します。
-- =====================================================

-- articlesテーブルにthumbnail_urlカラムを追加
ALTER TABLE articles 
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- カラムの説明を追加
COMMENT ON COLUMN articles.thumbnail_url IS '記事のサムネイル画像URL（最初にアップロードした画像を自動設定）';

-- =====================================================
-- マイグレーション 3: 保留画像管理テーブル
-- =====================================================
-- PDFから抽出された画像で、記事への紐付けが保留中のものを
-- 管理するテーブルを作成します。
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
-- マイグレーション 4: Newsletter画像用Storageバケット
-- =====================================================
-- 画像専用のStorageバケットとアクセスポリシーを設定します。
-- 本番環境用の設定です。
-- =====================================================

-- ストレージバケットの作成（画像専用）
-- バケットがすでに存在する場合はスキップ
INSERT INTO storage.buckets (id, name, public)
VALUES ('newsletter-images', 'newsletter-images', true)
ON CONFLICT (id) DO NOTHING;

-- 既存のポリシーを削除（エラー回避）
DROP POLICY IF EXISTS "Public Access newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous upload newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous update newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous delete newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete newsletter images" ON storage.objects;

-- 公開アクセスポリシー（誰でも閲覧可能）
CREATE POLICY "Public Access newsletter images"
ON storage.objects FOR SELECT
USING (bucket_id = 'newsletter-images');

-- 匿名ユーザーおよび認証済みユーザーがアップロード可能（RLSエラー対策）
CREATE POLICY "Allow anonymous upload newsletter images"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'newsletter-images');

-- 匿名ユーザーおよび認証済みユーザーが更新可能（RLSエラー対策）
CREATE POLICY "Allow anonymous update newsletter images"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'newsletter-images');

-- 匿名ユーザーおよび認証済みユーザーが削除可能（RLSエラー対策）
CREATE POLICY "Allow anonymous delete newsletter images"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'newsletter-images');

-- =====================================================
-- マイグレーション完了！
-- =====================================================
-- 【確認事項】
-- ✅ エラーが表示されていないことを確認してください
-- ✅ 「Success. No rows returned」または類似のメッセージが表示されればOKです
--
-- 【次のステップ】
-- 1. 左メニューの「Table Editor」を開く
-- 2. newslettersテーブルを開いて、以下のカラムが追加されていることを確認:
--    - digest_audio_url
--    - digest_audio_filename
-- 3. articlesテーブルを開いて、以下のカラムが追加されていることを確認:
--    - thumbnail_url
-- 4. pending_imagesテーブルが作成されていることを確認
-- 5. 左メニューの「Storage」を開く
-- 6. newsletter-imagesバケットが作成されていることを確認
-- 7. バケットを開いて「Policies」タブで以下のポリシーが設定されていることを確認:
--    - Public Access newsletter images (SELECT)
--    - Allow anonymous upload newsletter images (INSERT)
--    - Allow anonymous update newsletter images (UPDATE)
--    - Allow anonymous delete newsletter images (DELETE)
--
-- 【アプリケーションの確認】
-- 本番環境のアプリケーションで以下の機能をテスト:
-- ✅ ダイジェスト音声の生成と再生
-- ✅ 記事サムネイルの表示
-- ✅ 画像のアップロードと表示
--
-- 【注意事項】
-- ⚠️ このポリシーは本番環境用ですが、匿名ユーザー（anon）もアップロード可能です
-- ⚠️ これはRLS（Row Level Security）エラーを回避するための設定です
-- ⚠️ より厳格なセキュリティが必要な場合は、admin アプリに認証機能を追加してください
-- =====================================================

-- 設定内容の確認クエリ（必要に応じて実行）
-- SELECT * FROM storage.buckets WHERE id = 'newsletter-images';
-- SELECT * FROM storage.policies WHERE bucket_id = 'newsletter-images';
