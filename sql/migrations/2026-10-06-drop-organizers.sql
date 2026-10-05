-- =====================================================
-- 旧団体マスタ organizers を消す（団体の名簿を booking_organizations に一本化した後始末）
-- =====================================================
-- 2026-10-05-org-master-unify.sql で organizers の中身（別名・主催/発行元・並び順・外部団体）を
-- booking_organizations へ移し、portal も d79db83 から booking_organizations を読み書きしている。
-- organizers を読むコードはもう無い（2026-10-06 に CC-SaaS・book-system・他リポジトリを確認）。
--
-- 前提: 2026-10-05-org-master-unify.sql が適用済みで、下の 1) の確認が 0行であること。
-- 実行手順: Supabase ダッシュボード → SQL Editor → 1) だけ先に Run して 0行を確かめる → ファイル全体を Run
-- 一度だけ流す（消したあとは organizers が無いので 1)・2) ともエラーになる。それで正常）。
-- 戻し方: 消す前に控えを organizers_backup_20261006 に取る（不要になったら DROP TABLE で消す）。
-- =====================================================

-- 1) 確認: organizers の団体がすべて booking_organizations に対応づいているか（0行なら OK）
CREATE OR REPLACE FUNCTION pg_temp.norm_org(s TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(regexp_replace(COALESCE(s, ''), '[\s　]', '', 'g'), 'ケｹ', 'ヶヶ')
$$;

SELECT o.name AS 対応なし
FROM organizers o
WHERE NOT EXISTS (
  SELECT 1 FROM booking_organizations b
  WHERE pg_temp.norm_org(b.name) = pg_temp.norm_org(o.name)
     OR pg_temp.norm_org(o.name) = ANY (SELECT pg_temp.norm_org(a) FROM UNNEST(b.aliases) a)
);

-- 2) 控えを取ってから消す
BEGIN;

CREATE TABLE IF NOT EXISTS organizers_backup_20261006 AS TABLE organizers;
ALTER TABLE organizers_backup_20261006 ENABLE ROW LEVEL SECURITY;  -- 控えは公開鍵から読めないようにする（ポリシーなし）

DROP POLICY IF EXISTS organizers_read ON organizers;
DROP POLICY IF EXISTS organizers_write ON organizers;
DROP TABLE IF EXISTS organizers;

COMMIT;
