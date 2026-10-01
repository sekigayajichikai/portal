-- =====================================================
-- どのアプリからも使っていないテーブルを、公開鍵から触れないようにする
-- =====================================================
-- いまは公開鍵（anon key）1本で全テーブルを読み書きできる。
-- まず「どちらのアプリからも参照されていない空のテーブル」を閉じる。
-- RLS を有効にしてポリシーを1つも置かないと、公開鍵からは読むことも書くこともできなくなる。
-- （Supabase ダッシュボードや強い鍵からは今までどおり触れる）
--
-- 対象を選んだ根拠（2026-10-01 時点でコードを全文検索して確認）:
--   bus_schedules    … 0行。shared に関数はあるが、どの画面からも呼ばれていない（archive 由来）
--   radio_programs   … 0行。同上
--   calendar_banners … 0行。カレンダーアプリのコードに参照なし
--
-- 閉じなかったもの（使われているため。第3段のポリシー設計で扱う）:
--   booking_time_slots      … api/bookings-view.ts が時間帯マスタとして読む
--   booking_rooms           … 0行だが設定画面に編集UIがある
--   booking_equipment       … 設定画面と /api/masters が使う
--   booking_usage_categories… 同上
--   general_import_rows     … 旧経路だがカレンダーの管理画面が一覧・承認で使う
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → 貼り付けて Run
-- 元に戻すには: ALTER TABLE <名前> DISABLE ROW LEVEL SECURITY;
-- =====================================================

ALTER TABLE bus_schedules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE radio_programs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_banners ENABLE ROW LEVEL SECURITY;

-- ポリシーは置かない（＝公開鍵からは一切触れない）

SELECT c.relname AS テーブル, c.relrowsecurity AS 保護あり,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS ポリシー数
FROM pg_class c
WHERE c.relname IN ('bus_schedules','radio_programs','calendar_banners')
ORDER BY 1;
