-- =====================================================
-- 「関ヶ谷レポート」連載枠の作成
-- =====================================================
-- 独自記事（イベントレポート）機能の器となる newsletter を1件作成します。
-- 設計方針は docs/記事機能-設計.md（案B：常設の連載枠に記事をぶら下げる）を参照。
--
-- 実行手順:
--   1. Supabase ダッシュボード → SQL Editor → New query
--   2. このファイル全体を貼り付けて Run
--   3. 末尾の確認クエリで表示される id を控える（記事をぶら下げる際に使用）
--
-- 冪等: title='関ヶ谷レポート' が既にあれば作成しません（再実行しても安全）。
-- =====================================================

INSERT INTO newsletters (title, issue_date, status, organization_id, created_by, published_at)
SELECT
  '関ヶ谷レポート',
  '2026-09-01',                     -- 連載枠の便宜上の日付（月号ではないので固定）
  'published',                      -- 記事を公開ビューに出せるよう published
  -- 既存の newsletter に合わせて organization_id を継承（無ければ 'org1'）
  COALESCE((SELECT organization_id FROM newsletters WHERE organization_id IS NOT NULL LIMIT 1), 'org1'),
  'system',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM newsletters WHERE title = '関ヶ谷レポート'
);

-- 確認: この id を控えて記事のぶら下げに使う
SELECT id, title, issue_date, status, organization_id, published_at
FROM newsletters
WHERE title = '関ヶ谷レポート';
