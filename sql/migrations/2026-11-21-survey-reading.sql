-- =====================================================
-- アンケート読み取り（survey_sheets）と AI 利用記録（ai_usage_log）
-- =====================================================
-- 回収した紙のアンケート回答用紙をスキャン・写真から AI（Gemini）で読み取り、
-- 票ごとの読み取り結果と人の確認・修正を残す。
-- AI を呼ぶ前に「見込み ○○円」を出し、呼んだあとに実績を ai_usage_log に1回1行で残す
-- （DX委員会が会計に説明できるように。回覧板の記事化・予定抽出でも後から使える形）。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 冪等: IF NOT EXISTS / DROP POLICY IF EXISTS なので再実行しても安全。
-- 管理画面はメール＋パスワードで Supabase にログインしているので authenticated 向けのポリシー。
-- =====================================================

-- アンケートの定義（回覧板の「号」に相当。設問・選択肢は JSON で持つ）
CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY,                         -- 'bosai-kyoten-2026-10' のような短い英数字、または uuid 文字列
  title TEXT NOT NULL,                         -- 画面に出す名前
  sheet_title TEXT NOT NULL DEFAULT '',        -- 用紙の題名（AI に用紙の構成を伝える）
  questions JSONB NOT NULL DEFAULT '[]',       -- [{ key, no, text, kind, choices:[{no,label}], note }]
  status TEXT NOT NULL DEFAULT 'open'          -- draft（準備中）/ open（回収中）/ closed（集計済み）
    CHECK (status IN ('draft', 'open', 'closed')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE surveys IS 'アンケートの定義（設問・選択肢）。回答用紙の読み取りと集計の単位';
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS surveys_admin ON surveys;
CREATE POLICY surveys_admin ON surveys
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS survey_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id TEXT NOT NULL,                     -- 'bosai-kyoten-2026-10'（定義は packages/shared/services/survey/surveyDefinition.ts）
  region TEXT,                                 -- 関ヶ谷 / 山の手 / 夏山（紙は回収ルートで決まる）
  source_name TEXT NOT NULL,                   -- 元のファイル名
  source_page INTEGER NOT NULL DEFAULT 1,      -- PDF のページ番号（画像なら 1）
  reading JSONB,                               -- AI の読み取り { answers, confidence, flags, blank }
  corrected JSONB,                             -- 人が直した answers。null なら reading のまま
  status TEXT NOT NULL DEFAULT 'unread'        -- unread / read / review（確認待ち）/ confirmed（確認済み）/ invalid（無効票）
    CHECK (status IN ('unread', 'read', 'review', 'confirmed', 'invalid')),
  model TEXT,                                  -- 読んだモデル
  usage JSONB,                                 -- { input, output, thinking }
  thumb TEXT,                                  -- 縮小画像（data URL）。確認画面用。無記名だが筆跡が残るので公開鍵では読ませない（RLS）
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (survey_id, source_name, source_page)
);
COMMENT ON TABLE survey_sheets IS 'アンケート回答用紙の AI 読み取り結果と人の確認（1行＝用紙1枚）';
CREATE INDEX IF NOT EXISTS survey_sheets_survey_idx ON survey_sheets (survey_id, status);

ALTER TABLE survey_sheets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS survey_sheets_admin ON survey_sheets;
CREATE POLICY survey_sheets_admin ON survey_sheets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature TEXT NOT NULL,                       -- 'survey_read' など
  target TEXT,                                 -- アンケートID・号ID など
  items INTEGER NOT NULL DEFAULT 0,            -- 票数・PDF枚数など
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  thinking_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_jpy NUMERIC(10,2) NOT NULL DEFAULT 0, -- ボタンに出した見込み
  actual_jpy NUMERIC(10,2) NOT NULL DEFAULT 0,    -- 実績（単価×トークン）
  billing TEXT NOT NULL DEFAULT 'free'         -- free（無料枠）/ paid（有料枠）
    CHECK (billing IN ('free', 'paid')),
  note TEXT,                                   -- 途中で止まった理由など
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE ai_usage_log IS 'AI 呼び出しの使用量と金額の記録（1回の実行＝1行）';
CREATE INDEX IF NOT EXISTS ai_usage_log_created_idx ON ai_usage_log (created_at DESC);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_usage_log_admin ON ai_usage_log;
CREATE POLICY ai_usage_log_admin ON ai_usage_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

SELECT table_name, column_name, data_type FROM information_schema.columns
WHERE table_name IN ('surveys', 'survey_sheets', 'ai_usage_log') ORDER BY table_name, ordinal_position;
