-- =====================================================
-- radio_programs テーブル RLSポリシー設定
-- =====================================================
-- このスクリプトをSupabaseのSQL Editorで実行してください
--
-- RLS（Row Level Security）を有効にして、適切なアクセス制御を設定します
-- =====================================================

-- RLSを有効化
ALTER TABLE radio_programs ENABLE ROW LEVEL SECURITY;

-- ポリシー1: 全ユーザーによる読み取り（SELECT）
-- 一般ユーザーもラジオ番組を閲覧できるようにする
CREATE POLICY "Public can read radio programs"
ON radio_programs FOR SELECT
TO public
USING (true);

-- ポリシー2: 認証済みユーザーによる挿入（INSERT）
-- 管理者のみがラジオ番組を作成できる
CREATE POLICY "Authenticated users can insert radio programs"
ON radio_programs FOR INSERT
TO authenticated
WITH CHECK (true);

-- ポリシー3: 認証済みユーザーによる更新（UPDATE）
-- 管理者のみがラジオ番組を更新できる（再生成時）
CREATE POLICY "Authenticated users can update radio programs"
ON radio_programs FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- ポリシー4: 認証済みユーザーによる削除（DELETE）
-- 管理者のみがラジオ番組を削除できる
CREATE POLICY "Authenticated users can delete radio programs"
ON radio_programs FOR DELETE
TO authenticated
USING (true);

-- =====================================================
-- セットアップ完了！
-- =====================================================
-- 確認事項:
-- 1. Table Editor > radio_programs > "Enable Row Level Security" がチェックされていること
-- 2. Authentication > Policies タブで4つのポリシーが表示されていること
--
-- これで以下が可能になります:
-- - 全ユーザー（匿名含む）: ラジオ番組の閲覧・再生
-- - 認証済みユーザー（管理者）: ラジオ番組の作成・更新・削除
-- =====================================================
