-- =====================================================
-- 第3段の3歩目: 回覧板ポータル側のテーブルを守る（最後の仕上げ）
-- =====================================================
-- 記事・回覧板・予定カード・会場・団体のマスタは、まだ公開鍵で書き換えられる。
-- ここを閉じると、公開鍵1本で中身を書き換えられる場所がほぼ無くなる。
--
-- 前提（これが済んでいないと確認リンクが壊れる）:
--   1. 2026-10-02-review-token-functions.sql を先に実行していること
--   2. 回覧板ポータルの最新版がデプロイ済み（確認ページが合言葉で読む形になっている）
--
-- 読み取りの方針:
--   回覧板・記事・予定カードは「公開済みの号のものだけ」誰でも読める。
--   公開前の号は、確認リンクの合言葉を使う関数からしか読めない。
--   会場・団体のマスタは、公開画面が発行元の並び順などに使うので読み取りは開ける。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 元に戻すには: 各テーブルに ALTER TABLE <名前> DISABLE ROW LEVEL SECURITY;
-- =====================================================

-- ---------------------------------------------------------------
-- 1) 回覧板（号） … 公開済みだけ誰でも読める
-- ---------------------------------------------------------------
ALTER TABLE newsletters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS newsletters_read_published ON newsletters;
DROP POLICY IF EXISTS newsletters_write          ON newsletters;
CREATE POLICY newsletters_read_published ON newsletters
  FOR SELECT TO anon, authenticated USING (status = 'published');
CREATE POLICY newsletters_write ON newsletters
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- 2) 記事 … 公開済みの号のものだけ誰でも読める
-- ---------------------------------------------------------------
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS articles_read_published ON articles;
DROP POLICY IF EXISTS articles_write          ON articles;
CREATE POLICY articles_read_published ON articles
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM newsletters n WHERE n.id = articles.newsletter_id AND n.status = 'published'));
CREATE POLICY articles_write ON articles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- 3) 予定カード … 公開済みの号のものだけ誰でも読める
-- ---------------------------------------------------------------
ALTER TABLE event_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_cards_read_published ON event_cards;
DROP POLICY IF EXISTS event_cards_write          ON event_cards;
CREATE POLICY event_cards_read_published ON event_cards
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM newsletters n WHERE n.id = event_cards.newsletter_id AND n.status = 'published'));
CREATE POLICY event_cards_write ON event_cards
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- 4) 会場・団体のマスタ … 読むのは誰でも、書くのはログイン済みだけ
-- ---------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['venues','organizers']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO anon, authenticated USING (true)', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t || '_write', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- 5) いいね … 住民が押すので、読み書きとも誰でも。ただし他人の分は消せない
-- ---------------------------------------------------------------
-- 同じ人が同じ記事に何度も入れられないよう、重複を防ぐ索引を付ける（無ければ）
CREATE UNIQUE INDEX IF NOT EXISTS article_likes_unique ON article_likes (article_id, device_id);

ALTER TABLE article_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS article_likes_read   ON article_likes;
DROP POLICY IF EXISTS article_likes_insert ON article_likes;
DROP POLICY IF EXISTS article_likes_delete ON article_likes;
CREATE POLICY article_likes_read   ON article_likes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY article_likes_insert ON article_likes FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY article_likes_delete ON article_likes FOR DELETE TO anon, authenticated USING (true);
-- ※ 誰が押したかは端末ごとの文字列（device_id）でしか分からず、本人かどうかを確かめる術がない。
--    そのため「自分の分だけ消せる」はデータベースでは表現できない。いたずらで他人のいいねを
--    消される余地は残るが、被害は小さいのでここまでにする。

-- ---------------------------------------------------------------
-- 6) 確認
-- ---------------------------------------------------------------
SELECT c.relname AS テーブル,
       c.relrowsecurity AS 保護,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename = c.relname) AS ポリシー数,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename = c.relname
         AND 'anon' = ANY (p.roles) AND p.cmd = 'SELECT') AS 公開読み取り
FROM pg_class c
WHERE c.relname IN ('newsletters','articles','event_cards','venues','organizers','article_likes')
ORDER BY 1;
