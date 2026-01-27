-- =====================================================
-- Newsletter画像用Storageバケットセットアップスクリプト（本番環境用）
-- =====================================================
-- このスクリプトは本番環境用です。
-- 匿名ユーザー（anon）および認証済みユーザー（authenticated）が画像をアップロードできます。
--
-- ⚠️ 注意: RLSポリシーエラー対策のため、anonユーザーもアップロード可能にしています
--
-- 実行手順:
-- 1. Supabaseダッシュボード (https://supabase.com) にログイン
-- 2. 本番用プロジェクトを選択
-- 3. 左メニューから「SQL Editor」を開く
-- 4. 「New query」をクリック
-- 5. このスクリプト全体をコピー＆ペースト
-- 6. 「Run」ボタンをクリック
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
-- セットアップ完了！
-- =====================================================
-- 次のステップ:
-- 1. 実行が成功したか確認（エラーがないこと）
-- 2. 左メニューの「Storage」でバケットが作成されたことを確認
-- 3. Storageバケット「newsletter-images」を開く
-- 4. 「Policies」タブで以下のポリシーが設定されていることを確認：
--    - Public Access newsletter images (SELECT)
--    - Authenticated users can upload newsletter images (INSERT)
--    - Authenticated users can update newsletter images (UPDATE)
--    - Authenticated users can delete newsletter images (DELETE)
-- 5. アプリケーションから画像アップロード機能を試してみる
--
-- 注意事項:
-- - このポリシーは本番環境用です
-- - 匿名ユーザー（anon）および認証済みユーザーが画像をアップロード・削除できます
-- - RLS（Row Level Security）エラーを回避するため、anonユーザーも許可しています
-- - 画像は誰でも閲覧可能です（public設定）
-- - より厳格なセキュリティが必要な場合は、admin アプリに認証機能を追加してください
-- =====================================================

-- 設定内容の確認
-- SELECT * FROM storage.buckets WHERE id = 'newsletter-images';
-- SELECT * FROM storage.policies WHERE bucket_id = 'newsletter-images';
