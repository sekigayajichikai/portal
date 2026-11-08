-- =====================================================
-- 週次配信の「この人に送る」の送り先（名前＋LINEのユーザーID）を共有で登録する表（line_test_recipients）
-- =====================================================
-- 今までは画面の入力欄に ID を直接入れていた（ブラウザごとに1つだけ覚える）。
-- 役員それぞれが自分の名前と ID を登録し、どの端末からでもプルダウンで選んで自分だけに送れるようにする（2026-11-08 ユーザー決定: B案＝DBで共有）。
-- 送るときは全員配信以外と同じく「＜テスト配信＞」付きで届く。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 冪等: IF NOT EXISTS / DROP POLICY IF EXISTS なので再実行しても安全。
-- =====================================================

CREATE TABLE IF NOT EXISTS line_test_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                       -- 画面に出す名前（例: はな、会長）
  line_user_id TEXT NOT NULL UNIQUE,        -- LINE のユーザーID（U + 32桁の16進）
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE line_test_recipients IS '週次配信の「この人に送る」の送り先（名前＋LINEユーザーID）。管理画面で登録';

-- 管理画面（ログイン済み）は読み書きできる
ALTER TABLE line_test_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS line_test_recipients_admin ON line_test_recipients;
CREATE POLICY line_test_recipients_admin ON line_test_recipients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'line_test_recipients' ORDER BY ordinal_position;
