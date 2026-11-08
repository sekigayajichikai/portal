-- =====================================================
-- 公式LINE（Bot）が参加しているグループ・複数人トークの控え（line_groups）＋「この人に送る」の送り先にグループを許可
-- =====================================================
-- LINE のグループ ID（C で始まる33文字。複数人トークは R）はアプリの画面からは見えず、Bot をグループに招待したときの
-- 参加イベントやグループ内の発言イベントが Webhook に届いたときにだけ分かる。line-webhook がここに控え、
-- 週次配信の「送る相手の登録」に「Bot が参加中のグループ」として出す（2026-11-08）。
-- line_test_recipients.line_user_id にはユーザー ID のほかグループ ID・複数人トーク ID も入る（列名はそのまま）。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run（再実行しても安全）
-- =====================================================

CREATE TABLE IF NOT EXISTS line_groups (
  group_id TEXT PRIMARY KEY,                 -- C…（グループ）または R…（複数人トーク）
  kind TEXT NOT NULL DEFAULT 'group' CHECK (kind IN ('group', 'room')),
  name TEXT,                                 -- グループ名（LINE の summary API から。複数人トークは取れないので null）
  picture_url TEXT,
  joined_at TIMESTAMPTZ,                     -- Bot が参加した日時（join イベント）
  left_at TIMESTAMPTZ,                       -- Bot が退出・退会させられた日時（leave イベント）。null なら参加中
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 最後にこのグループのイベントが届いた日時
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE line_groups IS '公式LINE（Bot）が参加しているグループ・複数人トーク。line-webhook が参加・発言イベントから控える';

-- 管理画面（ログイン済み）は読める。書くのは line-webhook（service_role、RLS の外）
ALTER TABLE line_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS line_groups_admin_read ON line_groups;
CREATE POLICY line_groups_admin_read ON line_groups FOR SELECT TO authenticated USING (true);

COMMENT ON COLUMN line_test_recipients.line_user_id IS 'LINE のユーザーID（U…）、グループID（C…）、複数人トークID（R…）のどれか';

SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'line_groups' ORDER BY ordinal_position;
