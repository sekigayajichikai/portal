-- =====================================================
-- 週次配信: 下書きに「版番号」(revision) を付け、配信履歴・予約に「どの版を送ったか」(draft_revision) を残す
-- =====================================================
-- 配信履歴に日時と配信日しか無く、どの内容（版）を送ったのか分からなかった（2026-11-08 ユーザー指示）。
-- - weekly_digest_drafts.revision … 保存のたびにトリガーで 1 ずつ増える（新規は 1）。画面では「#12」のように出す
-- - weekly_digest_sends.draft_revision / weekly_digest_schedules.draft_revision … 送った・予約した時点の版番号
-- 列が無いあいだも画面は動く（版番号が出ない・残らないだけ）。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run（再実行しても安全）
-- =====================================================

ALTER TABLE weekly_digest_drafts ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION weekly_digest_drafts_bump_revision() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.revision := GREATEST(COALESCE(NEW.revision, 0), 1);
  ELSE
    NEW.revision := COALESCE(OLD.revision, 0) + 1;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_weekly_digest_drafts_revision ON weekly_digest_drafts;
CREATE TRIGGER trg_weekly_digest_drafts_revision
  BEFORE INSERT OR UPDATE ON weekly_digest_drafts
  FOR EACH ROW EXECUTE FUNCTION weekly_digest_drafts_bump_revision();

ALTER TABLE weekly_digest_sends ADD COLUMN IF NOT EXISTS draft_revision INTEGER;
ALTER TABLE weekly_digest_schedules ADD COLUMN IF NOT EXISTS draft_revision INTEGER;

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE (table_name = 'weekly_digest_drafts' AND column_name = 'revision')
   OR (table_name IN ('weekly_digest_sends', 'weekly_digest_schedules') AND column_name = 'draft_revision');
