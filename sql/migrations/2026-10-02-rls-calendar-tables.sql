-- =====================================================
-- 第3段の2歩目: カレンダー側のテーブルを守る
-- =====================================================
-- 2026-10-02 に、カレンダーアプリのログインも Supabase Auth になり、
-- 外から叩ける窓口（api/）も認証と強い鍵（service_role）に切り替えた。
-- そこで、予約・予定・団体マスタなどを「読むのは誰でも、書くのはログイン済みだけ」にする。
--
-- 前提（これが済んでいないと画面が壊れる）:
--   1. Vercel の sekigaya-calendar に SUPABASE_SERVICE_ROLE_KEY が設定済み
--   2. カレンダーアプリの最新版がデプロイ済み（ログインが Supabase Auth になっている）
--   3. 回覧板ポータルの最新版がデプロイ済み（同上）
--
-- 窓口（api/）は強い鍵で動くので、ここで入れる制限を越えて読み書きできる。
-- だから予約の申し込み（/api/booking）やインポートの反映は、これまでどおり通る。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 元に戻すには: 各テーブルに ALTER TABLE <名前> DISABLE ROW LEVEL SECURITY;
-- =====================================================

-- ---------------------------------------------------------------
-- 1) 住民も見るもの … 読むのは誰でも、書くのはログイン済みだけ
-- ---------------------------------------------------------------
-- 予約（会館の空き状況として公開画面に出る）
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bookings_read   ON bookings;
DROP POLICY IF EXISTS bookings_write  ON bookings;
CREATE POLICY bookings_read  ON bookings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY bookings_write ON bookings FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- 予定（カレンダーに出る）
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_events_read  ON calendar_events;
DROP POLICY IF EXISTS calendar_events_write ON calendar_events;
CREATE POLICY calendar_events_read  ON calendar_events FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY calendar_events_write ON calendar_events FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- 団体（団体フィルタの選択肢として公開画面が読む。パスコードは別テーブルに隔離済み）
ALTER TABLE booking_organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booking_organizations_read  ON booking_organizations;
DROP POLICY IF EXISTS booking_organizations_write ON booking_organizations;
CREATE POLICY booking_organizations_read  ON booking_organizations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY booking_organizations_write ON booking_organizations FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- 団体のカテゴリ（団体フィルタの見出し）
ALTER TABLE booking_org_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booking_org_groups_read  ON booking_org_groups;
DROP POLICY IF EXISTS booking_org_groups_write ON booking_org_groups;
CREATE POLICY booking_org_groups_read  ON booking_org_groups FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY booking_org_groups_write ON booking_org_groups FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- 設定系のマスタ（部屋・時間帯・備品・利用区分・場所）
-- 時間帯は会館予約ビューが読むので、読み取りは開けておく
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['booking_rooms','booking_time_slots','booking_equipment','booking_usage_categories','event_locations']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO anon, authenticated USING (true)', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t || '_write', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- 2) 事務局しか見ないもの … ログイン済みだけ（公開鍵からは見えない）
-- ---------------------------------------------------------------
-- インポートの作業台と設定。既に RLS 有効で「誰でも全部」のポリシーが付いているものは置き換える。
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['import_batches','import_rows','app_settings','general_import_rows']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- 旧ポリシー（USING (true) で誰でも書けるもの）をすべて外す
    EXECUTE (
      SELECT coalesce(string_agg(format('DROP POLICY IF EXISTS %I ON %I;', policyname, t), ' '), 'SELECT 1')
      FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    );
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t || '_admin', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- 3) 確認
-- ---------------------------------------------------------------
SELECT c.relname AS テーブル,
       c.relrowsecurity AS 保護,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename = c.relname) AS ポリシー数,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename = c.relname
         AND 'anon' = ANY (p.roles)) AS 公開読み取り
FROM pg_class c
WHERE c.relname IN (
  'bookings','calendar_events','booking_organizations','booking_org_groups',
  'booking_rooms','booking_time_slots','booking_equipment','booking_usage_categories',
  'event_locations','import_batches','import_rows','app_settings','general_import_rows'
)
ORDER BY 1;
