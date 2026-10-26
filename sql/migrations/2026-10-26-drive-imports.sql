-- =====================================================
-- Drive 自動取り込みの取込記録 drive_imports
-- =====================================================
-- Google Drive の月フォルダから「関ヶ谷だより」「会報ふれあい」を自動で記事にする仕組み
-- （docs/Drive取り込み-計画.md 第1段階、scripts/drive-import/）が、
-- 「どのファイルを・どの号に・いつ取り込んだか」を残す。同じファイルを二度取り込まないため、
-- Drive 側で差し替えられたこと（md5 の違い）を知らせるため、管理画面の「今月の流れ」に出すため。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 冪等: IF NOT EXISTS / DROP POLICY IF EXISTS なので再実行しても安全。
-- =====================================================

CREATE TABLE IF NOT EXISTS drive_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_file_id TEXT NOT NULL UNIQUE,          -- Drive のファイルID
  drive_name TEXT NOT NULL,                    -- ファイル名（取込時点。差し替え検知で更新）
  drive_md5 TEXT,                              -- 内容の指紋（Drive の md5Checksum）
  drive_modified_at TIMESTAMPTZ,               -- Drive 側の更新日時
  month_folder TEXT NOT NULL,                  -- 月フォルダ名 '202611'
  media TEXT,                                  -- '関ヶ谷だより' / '会報ふれあい'
  kind TEXT NOT NULL DEFAULT 'source'          -- source=記事にする / attachment=PDFのまま / image=pic
    CHECK (kind IN ('source', 'attachment', 'image')),
  newsletter_id UUID REFERENCES newsletters(id) ON DELETE SET NULL,
  pdf_url TEXT,                                -- Storage の URL
  pdf_label TEXT,                              -- 登録した題名（AI の提案）
  articles_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'imported'      -- imported / updated（Drive 側が新しい）/ failed / skipped
    CHECK (status IN ('imported', 'updated', 'failed', 'skipped')),
  error TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE drive_imports IS 'Google Drive からの自動取り込みの記録（scripts/drive-import）';
CREATE INDEX IF NOT EXISTS drive_imports_month_idx ON drive_imports (month_folder);
CREATE INDEX IF NOT EXISTS drive_imports_newsletter_idx ON drive_imports (newsletter_id);

-- 管理画面（ログイン済み）は読み書きできる。取り込みプログラムは service_role なので RLS の外
ALTER TABLE drive_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS drive_imports_admin ON drive_imports;
CREATE POLICY drive_imports_admin ON drive_imports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'drive_imports' ORDER BY ordinal_position;
