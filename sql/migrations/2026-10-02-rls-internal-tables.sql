-- =====================================================
-- 第3段の1歩目: 内部テーブルとファイル置き場を、ログイン済みだけに絞る
-- =====================================================
-- 2026-10-02 に回覧板ポータルのログインを Supabase Auth にしたので、
-- 管理画面の読み書きは「ログイン済みの人」として届くようになった。
-- そこで、公開画面がまったく読まないテーブルと、ファイルの置き場を先に閉じる。
--
-- **カレンダーアプリ（book-system）はまだログインが Supabase Auth になっていない。**
-- そのため、カレンダーアプリが触るテーブル（bookings / calendar_events / booking_* /
-- import_* / app_settings / event_locations）はここでは触らない。閉じると一斉に壊れる。
-- 同じ理由で、公開画面が読むテーブル（newsletters / articles / event_cards /
-- venues / organizers / article_libraries など）も、別の回で扱う。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 元に戻すには: 各テーブルに ALTER TABLE <名前> DISABLE ROW LEVEL SECURITY;
--               Storage は末尾の「戻し方」を参照
-- =====================================================

-- ---------------------------------------------------------------
-- 1) 公開画面が読まないテーブル → ログイン済みだけ
-- ---------------------------------------------------------------

-- 週次配信の下書き（配信日ごとに1行、管理画面から自動保存）
ALTER TABLE weekly_digest_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS weekly_digest_drafts_admin ON weekly_digest_drafts;
CREATE POLICY weekly_digest_drafts_admin ON weekly_digest_drafts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 週次配信の送信履歴
-- ※ このテーブルは RLS が有効なのにポリシーが1つも無く、公開鍵からは書けない状態だった。
--    管理画面からの記録（lineBroadcastService）が失敗していた可能性が高い（0行）。
ALTER TABLE weekly_digest_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS weekly_digest_sends_admin ON weekly_digest_sends;
CREATE POLICY weekly_digest_sends_admin ON weekly_digest_sends
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- LINE リッチメニューの定義
ALTER TABLE line_rich_menus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS line_rich_menus_admin ON line_rich_menus;
CREATE POLICY line_rich_menus_admin ON line_rich_menus
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 記事に割り当てる前の画像
ALTER TABLE pending_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pending_images_admin ON pending_images;
CREATE POLICY pending_images_admin ON pending_images
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 旧・発行元マスタ（2026-10-01 に団体マスタへ一本化。コードはもう読まない）
-- ポリシーを置かない＝公開鍵からもログイン済みからも触れない。中身は管理者権限でのみ見える。
ALTER TABLE publishers ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------
-- 2) ファイルの置き場 → 読むのは誰でも、書くのはログイン済みだけ
-- ---------------------------------------------------------------
-- これまで3バケットとも、公開鍵だけで任意のファイルをアップロード・上書き・削除できた。
-- 回覧板のPDFや記事画像を差し替えられる状態だったので、書き込みから anon を外す。
-- 読み取り（SELECT）は公開のまま変えない。住民が見られなくなるため。

DROP POLICY IF EXISTS "Allow anon upload newsletters" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon update newsletters" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon delete newsletters" ON storage.objects;
CREATE POLICY "newsletters upload (login)" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'newsletters');
CREATE POLICY "newsletters update (login)" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'newsletters') WITH CHECK (bucket_id = 'newsletters');
CREATE POLICY "newsletters delete (login)" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'newsletters');

DROP POLICY IF EXISTS "Allow anonymous upload newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous update newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous delete newsletter images" ON storage.objects;
CREATE POLICY "newsletter-images upload (login)" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'newsletter-images');
CREATE POLICY "newsletter-images update (login)" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'newsletter-images') WITH CHECK (bucket_id = 'newsletter-images');
CREATE POLICY "newsletter-images delete (login)" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'newsletter-images');

DROP POLICY IF EXISTS "Allow anon upload radio" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon update radio" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon delete radio" ON storage.objects;
CREATE POLICY "radio upload (login)" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'radio');
CREATE POLICY "radio update (login)" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'radio') WITH CHECK (bucket_id = 'radio');
CREATE POLICY "radio delete (login)" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'radio');

-- ---------------------------------------------------------------
-- 3) 確認
-- ---------------------------------------------------------------
SELECT c.relname AS テーブル,
       c.relrowsecurity AS 保護あり,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename = c.relname) AS ポリシー数
FROM pg_class c
WHERE c.relname IN ('weekly_digest_drafts','weekly_digest_sends','line_rich_menus','pending_images','publishers')
ORDER BY 1;

-- 戻し方（Storage）:
--   DROP POLICY "newsletters upload (login)" ON storage.objects;  … 各ポリシーを削除し、
--   CREATE POLICY "Allow anon upload newsletters" ON storage.objects
--     FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'newsletters');
--   のように anon を含めた形で作り直す。
