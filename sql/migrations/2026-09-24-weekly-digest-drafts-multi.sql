-- =====================================================
-- 週次配信の下書きを「配信日ごとに複数」持てるようにする（weekly_digest_drafts に id / name を追加）
-- =====================================================
-- 2026-09-24-weekly-digest-drafts.sql は配信日を主キーにしていた（1週に1つ）。
-- 同じ週で A案・B案を比べたり、先の週の分を作りだめできるよう、主キーを id に変えて名前を持たせる。
-- 既存の行はそのまま残る（id は自動採番、name は空＝画面で「配信日の下書き」と表示）。
-- 配信履歴 weekly_digest_sends には「どの下書きから送ったか」の draft_id を足す。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 冪等: 主キーの差し替えは「まだ base_date が主キーのときだけ」行うので再実行しても安全。
-- =====================================================

ALTER TABLE weekly_digest_drafts ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE weekly_digest_drafts ADD COLUMN IF NOT EXISTS name TEXT;

DO $$
BEGIN
  -- 主キーが base_date のままなら id に差し替える
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage k
      ON k.constraint_name = tc.constraint_name AND k.table_name = tc.table_name
    WHERE tc.table_name = 'weekly_digest_drafts'
      AND tc.constraint_type = 'PRIMARY KEY'
      AND k.column_name = 'base_date'
  ) THEN
    ALTER TABLE weekly_digest_drafts DROP CONSTRAINT weekly_digest_drafts_pkey;
    ALTER TABLE weekly_digest_drafts ADD PRIMARY KEY (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_weekly_digest_drafts_date ON weekly_digest_drafts (base_date DESC, updated_at DESC);

ALTER TABLE weekly_digest_sends ADD COLUMN IF NOT EXISTS draft_id UUID;  -- 送信元の下書き（任意）

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'weekly_digest_drafts';
