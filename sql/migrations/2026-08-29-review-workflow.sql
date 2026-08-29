-- =====================================================
-- 公開前の担当者確認（承認フロー）用マイグレーション
-- =====================================================
-- newsletters に確認・承認関連のカラムを追加します。
-- SupabaseのSQL Editorで実行してください。
--
-- フロー:
-- 1. 管理画面で「確認を依頼」→ review_token を発行し review_status='pending'
-- 2. 担当者が /review/<token> を開いてプレビューを確認
-- 3. 「承認」→ review_status='approved' / 「修正依頼」→ 'changes_requested'
-- 4. 承認済みになると管理画面の「公開する」ボタンが有効になる
-- =====================================================

ALTER TABLE newsletters
  ADD COLUMN IF NOT EXISTS review_status TEXT
    CHECK (review_status IN ('pending', 'approved', 'changes_requested'));

ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS review_token TEXT;
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS review_comment TEXT;
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS reviewer_name TEXT;

-- トークンでの一意検索用（NULLは対象外）
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletters_review_token
  ON newsletters (review_token)
  WHERE review_token IS NOT NULL;

COMMENT ON COLUMN newsletters.review_status IS '確認状況: NULL=未依頼, pending=確認待ち, approved=承認済み, changes_requested=修正依頼';
COMMENT ON COLUMN newsletters.review_token IS '担当者確認ページ(/review/<token>)用の推測不能なトークン';
COMMENT ON COLUMN newsletters.review_comment IS '担当者からのコメント（修正依頼の内容など）';
COMMENT ON COLUMN newsletters.reviewer_name IS '確認した担当者の名前（任意入力）';
