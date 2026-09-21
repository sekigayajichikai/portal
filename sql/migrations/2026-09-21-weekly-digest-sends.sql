-- =====================================================
-- 週次配信の配信履歴 weekly_digest_sends を追加
-- =====================================================
-- 週次配信タブから LINE（Messaging API）へ送ったものを記録する（docs/週次配信.md）。
-- 「何をいつ送ったか」「テスト送信か全員配信か」を残し、同じ週の二重配信に気づけるようにする。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 冪等: IF NOT EXISTS なので再実行しても安全。未作成でも送信自体は動く（履歴だけ残らない）。
-- =====================================================

CREATE TABLE IF NOT EXISTS weekly_digest_sends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  base_date DATE NOT NULL,              -- 配信日（週の起点）
  mode TEXT NOT NULL,                   -- validate / test / broadcast
  text TEXT,                            -- 送ったテキスト（吹き出し1）
  messages JSONB,                       -- 送ったメッセージ全体（Flex JSON 含む）
  line_status INTEGER,                  -- LINE API の HTTP ステータス
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
COMMENT ON TABLE weekly_digest_sends IS '週次配信（今週のお知らせ）の LINE 送信履歴';

CREATE INDEX IF NOT EXISTS idx_weekly_digest_sends_sent_at ON weekly_digest_sends (sent_at DESC);

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'weekly_digest_sends';
