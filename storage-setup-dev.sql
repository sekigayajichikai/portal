-- =====================================================
-- Supabase Storage セットアップスクリプト（開発環境用）
-- =====================================================
-- このスクリプトは開発環境専用です。
-- 匿名ユーザー（anon）もPDFをアップロードできるため、
-- テスト用のSupabaseプロジェクトでのみ使用してください。
--
-- ⚠️ 警告: 本番環境では絶対に使用しないでください！
--
-- 実行手順:
-- 1. Supabaseダッシュボード (https://supabase.com) にログイン
-- 2. テスト用プロジェクトを選択
-- 3. 左メニューから「SQL Editor」を開く
-- 4. 「New query」をクリック
-- 5. このスクリプト全体をコピー＆ペースト
-- 6. 「Run」ボタンをクリック
-- =====================================================

-- ストレージバケットの作成
INSERT INTO storage.buckets (id, name, public)
VALUES ('newsletters', 'newsletters', true)
ON CONFLICT (id) DO NOTHING;

-- 既存のポリシーを削除（エラー回避）
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update own files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous upload in dev" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous update in dev" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous delete in dev" ON storage.objects;

-- 公開アクセスポリシー（誰でも閲覧可能）
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'newsletters');

-- 開発環境用アップロードポリシー（匿名ユーザーも含む）
CREATE POLICY "Allow anonymous upload in dev"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'newsletters');

-- 開発環境用更新ポリシー（匿名ユーザーも含む）
CREATE POLICY "Allow anonymous update in dev"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'newsletters');

-- 開発環境用削除ポリシー（匿名ユーザーも含む）
CREATE POLICY "Allow anonymous delete in dev"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'newsletters');

-- =====================================================
-- セットアップ完了！
-- =====================================================
-- 次のステップ:
-- 1. 実行が成功したか確認（エラーがないこと）
-- 2. 左メニューの「Storage」でバケットが作成されたことを確認
-- 3. アプリケーションからPDFアップロード機能を試してみる
--
-- 注意事項:
-- - このポリシーは開発環境専用です
-- - 誰でもPDFをアップロード・削除できます
-- - 本番環境では storage-setup-prod.sql を使用してください
-- =====================================================

-- 設定内容の確認
-- SELECT * FROM storage.buckets WHERE id = 'newsletters';
-- SELECT * FROM storage.policies WHERE bucket_id = 'newsletters';
