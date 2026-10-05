-- =====================================================
-- 週次配信の予約配信 weekly_digest_schedules と、5分ごとの送信ジョブ
-- =====================================================
-- 週次配信タブの「日時を指定して予約」で、LINE に送るメッセージ（画像URL込み）を予約した時点の内容で保存する。
-- pg_cron が5分ごとに「送る時刻を過ぎた予約」があるかを見て、あれば Edge Function line-broadcast
-- （mode = run-scheduled）を呼ぶ。Edge Function が全員に配信し、結果をここと weekly_digest_sends に書く。
-- 仕様: docs/週次配信.md「予約配信」
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
--   ※ 先に Edge Function line-broadcast を新しい版でデプロイしておくこと（run-scheduled に対応した版）
-- 冪等: 再実行しても安全（テーブルは IF NOT EXISTS、ジョブは同じ名前で作り直す）
-- =====================================================

CREATE TABLE IF NOT EXISTS weekly_digest_schedules (
  -- 画面側で作る UUID。LINE の X-Line-Retry-Key にも使い、同じ予約が二重に届かないようにする
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_date DATE NOT NULL,                -- 配信日（週の起点）
  send_at TIMESTAMP WITH TIME ZONE NOT NULL, -- 送る日時（実際は最大5分遅れ）
  messages JSONB NOT NULL,                -- 送るメッセージ全体（予約した時点の内容で固定）
  text TEXT,                              -- テキスト吹き出し（履歴の表示用）
  content_key TEXT,                       -- 予約後に画面の内容が変わったかを見分けるための値
  draft_id UUID,                          -- 予約元の下書き（任意）
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'sending', 'sent', 'failed', 'canceled')),
  line_status INTEGER,                    -- LINE API の HTTP ステータス
  error TEXT,                             -- 失敗の理由
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
COMMENT ON TABLE weekly_digest_schedules IS '週次配信の予約配信（pg_cron が5分ごとに送る）';

CREATE INDEX IF NOT EXISTS idx_weekly_digest_schedules_due ON weekly_digest_schedules (status, send_at);

-- 管理画面（ログイン済み）だけが読み書きできる。送信ジョブは Edge Function がサービスロールで書く
ALTER TABLE weekly_digest_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS weekly_digest_schedules_admin ON weekly_digest_schedules;
CREATE POLICY weekly_digest_schedules_admin ON weekly_digest_schedules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 5分ごとの送信ジョブ（pg_cron + pg_net）
-- 送る時刻を過ぎた予約があるときだけ Edge Function を呼ぶ（無駄な呼び出しをしない）
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'weekly-digest-scheduled-send';
SELECT cron.schedule(
  'weekly-digest-scheduled-send',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://iplcopuwwzbtwoakqifh.supabase.co/functions/v1/line-broadcast',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"mode": "run-scheduled"}'::jsonb
  )
  WHERE EXISTS (
    SELECT 1 FROM weekly_digest_schedules WHERE status = 'scheduled' AND send_at <= NOW()
  );
  $$
);

-- 確認
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'weekly-digest-scheduled-send';

-- 戻し方:
--   SELECT cron.unschedule('weekly-digest-scheduled-send');
--   DROP TABLE weekly_digest_schedules;
