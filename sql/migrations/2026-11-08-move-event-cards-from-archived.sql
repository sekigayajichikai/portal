-- =====================================================
-- 旧版の号に取り残された予定カード（event_cards）を、公開中の同じ号へ付け替える
-- =====================================================
-- 「編集版を作る」→ 公開 で元の号が「(旧版)」になるとき、記事は複製されるが予定カードは複製も付け替えもされず、
-- 旧版の号に取り残されていた（2026-11-08 に「2026年11月号 (旧版)」の「おおぞらふれあいまつり」で発覚）。
-- 旧版の予定は住民側の予定一覧にも週次配信にも出ない。
-- コード側は同日に publishNewsletter で自動的に付け替えるよう直した（newsletterService.ts の moveEventCardsToNewVersion）。
-- これは既存データの一括修正。
--
-- 対象: status='archived' で題名が「◯◯ (旧版)」の号と、題名が「◯◯」で status='published' の号の組（すべて）。
-- - 新しい号に同じ予定（同じ日付・同じ題名）がすでにあるカードは動かさない（二重登録を避ける。旧版に残る）
-- - 記事リンクが旧版の記事を指していれば、新しい号の同じ題名の記事に付け替える
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → まず「確認」の SELECT だけ実行して対象を見る → 良ければ全体を Run
-- 冪等: 2回目以降は動かすものが無いので安全。
-- =====================================================

-- 確認: 付け替える予定の一覧
WITH pairs AS (
  SELECT a.id AS old_id, a.title AS old_title, p.id AS new_id, p.title AS new_title
  FROM newsletters a
  JOIN newsletters p
    ON p.status = 'published'
   AND p.title = regexp_replace(a.title, ' \(旧版\)$', '')
  WHERE a.status = 'archived'
)
SELECT pairs.old_title, pairs.new_title, c.event_date, c.title, c.weekly_topic,
       EXISTS (
         SELECT 1 FROM event_cards n
         WHERE n.newsletter_id = pairs.new_id
           AND n.event_date IS NOT DISTINCT FROM c.event_date
           AND btrim(n.title) = btrim(c.title)
       ) AS already_in_new   -- true のものは動かさない
FROM event_cards c
JOIN pairs ON c.newsletter_id = pairs.old_id
ORDER BY pairs.new_title, c.event_date;

-- 付け替え（本番）
WITH pairs AS (
  SELECT a.id AS old_id, p.id AS new_id
  FROM newsletters a
  JOIN newsletters p
    ON p.status = 'published'
   AND p.title = regexp_replace(a.title, ' \(旧版\)$', '')
  WHERE a.status = 'archived'
),
moved AS (
  UPDATE event_cards c
     SET newsletter_id = pairs.new_id
    FROM pairs
   WHERE c.newsletter_id = pairs.old_id
     AND NOT EXISTS (
       SELECT 1 FROM event_cards n
       WHERE n.newsletter_id = pairs.new_id
         AND n.event_date IS NOT DISTINCT FROM c.event_date
         AND btrim(n.title) = btrim(c.title)
     )
  RETURNING c.id, c.linked_article_id, pairs.old_id, pairs.new_id
)
-- 記事リンクを新しい号の同じ題名の記事へ
UPDATE event_cards c
   SET linked_article_id = na.id
  FROM moved m
  JOIN articles oa ON oa.id = m.linked_article_id AND oa.newsletter_id = m.old_id
  JOIN articles na ON na.newsletter_id = m.new_id AND na.title = oa.title
 WHERE c.id = m.id;

-- 結果: 公開中の号ごとの予定カード数
SELECT n.title, n.status, count(c.id) AS cards
FROM newsletters n
LEFT JOIN event_cards c ON c.newsletter_id = n.id
WHERE n.status IN ('published', 'archived')
GROUP BY n.title, n.status
ORDER BY n.title;
