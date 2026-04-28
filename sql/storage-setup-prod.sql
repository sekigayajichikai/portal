-- =====================================================
-- Supabase Storage セットアップスクリプト（本番環境用）
-- =====================================================
-- このスクリプトは本番環境用です。
-- 認証済みユーザー（authenticated）のみがPDFをアップロードできます。
--
-- 実行手順:
-- 1. Supabaseダッシュボード (https://supabase.com) にログイン
-- 2. 本番用プロジェクトを選択
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

-- 認証済みユーザーのアップロードポリシー
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'newsletters');

-- 認証済みユーザーの更新ポリシー
CREATE POLICY "Authenticated users can update own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'newsletters');

-- 認証済みユーザーの削除ポリシー
CREATE POLICY "Authenticated users can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'newsletters');

-- =====================================================
-- セットアップ完了！
-- =====================================================
-- 次のステップ:
-- 1. 実行が成功したか確認（エラーがないこと）
-- 2. 左メニューの「Storage」でバケットが作成されたことを確認
-- 3. アプリケーションに認証機能を実装
-- 4. 認証済みユーザーでPDFアップロード機能を試してみる
--
-- 注意事項:
-- - このポリシーは本番環境用です
-- - 認証済みユーザーのみがPDFをアップロード・削除できます
-- - 認証機能の実装が必要です（Supabase Auth）
-- =====================================================

-- 設定内容の確認
-- SELECT * FROM storage.buckets WHERE id = 'newsletters';
-- SELECT * FROM storage.policies WHERE bucket_id = 'newsletters';
