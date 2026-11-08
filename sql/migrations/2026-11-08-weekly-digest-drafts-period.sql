-- =====================================================
-- 週次配信の下書きに「内容の期間」の手調整を残す（weekly_digest_drafts に period_from / period_to を追加）
-- =====================================================
-- 内容の期間はふだん配信日から自動で決まる（日曜配信なら翌月曜〜日曜）。念のため画面で動かせるようにしたので、
-- その指定を下書きに残す。両方 NULL なら自動。
-- 列が無いあいだも画面は動く（期間の指定だけ保存されず、コンソールに警告が出る）。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run（再実行しても安全）
-- =====================================================

ALTER TABLE weekly_digest_drafts ADD COLUMN IF NOT EXISTS period_from DATE;
ALTER TABLE weekly_digest_drafts ADD COLUMN IF NOT EXISTS period_to DATE;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'weekly_digest_drafts' AND column_name IN ('period_from', 'period_to');
