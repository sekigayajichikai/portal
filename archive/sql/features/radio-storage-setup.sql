-- =====================================================
-- ラジオ番組用ストレージ セットアップスクリプト
-- =====================================================
-- このスクリプトをSupabaseのSQL Editorで実行してください
--
-- 実行前の準備:
-- 1. Supabase Dashboard > Storage に移動
-- 2. 「Create bucket」をクリック
-- 3. Bucket name: "radio" を入力
-- 4. Public bucket: ✓ チェックを入れる（一般ユーザーが再生できるようにする）
-- 5. 「Create bucket」をクリック
--
-- その後、以下のSQLスクリプトを実行してください
-- =====================================================

-- =====================================================
-- ストレージポリシー設定
-- =====================================================
-- 注意: 以下のポリシーは storage.objects テーブルに対するRLSポリシーです

-- 既存のポリシーを削除（存在する場合）
DROP POLICY IF EXISTS "Public read access for radio files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload radio files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update radio files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete radio files" ON storage.objects;

-- ポリシー1: 全ユーザーによる音声ファイルの読み取り（SELECT）
-- 一般ユーザーもラジオ番組を再生できるようにする
CREATE POLICY "Public read access for radio files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'radio');

-- ポリシー2: 認証済みユーザーによる音声ファイルのアップロード（INSERT）
-- 管理者のみがラジオ番組の音声ファイルをアップロードできる
CREATE POLICY "Authenticated users can upload radio files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'radio');

-- ポリシー3: 認証済みユーザーによる音声ファイルの更新（UPDATE）
-- 再生成時に既存ファイルを上書きできるようにする
CREATE POLICY "Authenticated users can update radio files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'radio')
WITH CHECK (bucket_id = 'radio');

-- ポリシー4: 認証済みユーザーによる音声ファイルの削除（DELETE）
-- 管理者のみが古いラジオ番組を削除できる
CREATE POLICY "Authenticated users can delete radio files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'radio');

-- =====================================================
-- ストレージ容量制限設定（オプション）
-- =====================================================
-- 1つの音声ファイルの最大サイズ: 50MB
-- （4分の音声は通常5-10MB程度ですが、余裕を持たせています）

-- Supabase Dashboardから設定する場合:
-- Storage > radio bucket > Settings > File size limit: 50MB

-- =====================================================
-- セットアップ完了！
-- =====================================================
-- 確認事項:
-- 1. Storage > radio バケットが存在すること
-- 2. バケットがPublicに設定されていること
-- 3. ポリシーが正しく適用されていること
--
-- テスト方法:
-- 1. 管理画面でラジオ番組を生成してみる
-- 2. 生成された音声ファイルが radio バケットに保存されることを確認
-- 3. 一般ユーザー画面でラジオ番組が再生できることを確認
-- =====================================================
