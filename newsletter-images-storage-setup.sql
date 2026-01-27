-- =====================================================
-- Newsletter画像用Storageバケットセットアップスクリプト
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

-- ストレージバケットの作成（画像専用）
INSERT INTO storage.buckets (id, name, public)
VALUES ('newsletter-images', 'newsletter-images', true)
ON CONFLICT (id) DO NOTHING;

-- 既存のポリシーを削除（エラー回避）
DROP POLICY IF EXISTS "Public Access newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous upload newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous update newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous delete newsletter images" ON storage.objects;

-- 公開アクセスポリシー（誰でも閲覧可能）
CREATE POLICY "Public Access newsletter images"
ON storage.objects FOR SELECT
USING (bucket_id = 'newsletter-images');

-- 開発環境用アップロードポリシー（匿名ユーザーも含む）
CREATE POLICY "Allow anonymous upload newsletter images"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'newsletter-images');

-- 開発環境用更新ポリシー（匿名ユーザーも含む）
CREATE POLICY "Allow anonymous update newsletter images"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'newsletter-images');

-- 開発環境用削除ポリシー（匿名ユーザーも含む）
CREATE POLICY "Allow anonymous delete newsletter images"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'newsletter-images');

-- =====================================================
-- セットアップ完了！
-- =====================================================
-- 次のステップ:
-- 1. 実行が成功したか確認（エラーがないこと）
-- 2. 左メニューの「Storage」でバケットが作成されたことを確認
-- 3. アプリケーションから画像アップロード機能を試してみる
--
-- 注意事項:
-- - このポリシーは開発環境専用です
-- - 誰でも画像をアップロード・削除できます
-- - 本番環境では認証済みユーザーのみに制限してください
-- =====================================================

-- 設定内容の確認
-- SELECT * FROM storage.buckets WHERE id = 'newsletter-images';
-- SELECT * FROM storage.policies WHERE bucket_id = 'newsletter-images';
