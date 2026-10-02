-- =====================================================
-- ゴミ箱（削除したものの控え）
-- =====================================================
-- 管理画面で号・記事・予定カード、カレンダーアプリで予定・予約を削除するとき、
-- 直前の中身をここへ控えておく。管理画面の「ゴミ箱」から元に戻せる。
-- （UI評価・改善計画 フェーズ0 A8。削除フラグ方式は読み取り箇所が多く、
--   漏れると削除した記事が住民に見えるため、控えを取る方式にした）
--
-- payload は「戻すときに入れ直す順」に並べたテーブルと行の配列:
--   [{"table": "newsletters", "rows": [...]}, {"table": "articles", "rows": [...]}]
--
-- 回覧板ポータルとカレンダーアプリの両方が同じテーブルを使う（同じ Supabase）。
-- 公開画面からは読めない（ログイン済みだけ）。
--
-- このSQLを流す前に新しい画面を公開しても壊れない（控えが取れないときは、
-- テーブルが無いと判断して従来どおり削除だけ行う）。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 元に戻すには: DROP TABLE trash_items;
-- =====================================================

CREATE TABLE IF NOT EXISTS trash_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 何を消したか: newsletter / article / event_card / calendar_event / booking
  kind text NOT NULL,
  -- 一覧に出す名前（号のタイトル、記事の見出し、予約の日付と部屋など）
  label text NOT NULL,
  payload jsonb NOT NULL,
  -- どのアプリから消したか: portal / calendar / import
  source text NOT NULL DEFAULT 'portal',
  deleted_at timestamptz NOT NULL DEFAULT now(),
  -- 消した人（いまは共通アカウントだが、個人アカウントにしたら名前が分かる）
  deleted_by uuid DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS trash_items_deleted_at_idx ON trash_items (deleted_at DESC);

ALTER TABLE trash_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trash_items_admin ON trash_items;
CREATE POLICY trash_items_admin ON trash_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 90日より古い控えは消してよい（手で流すか、あとで定期実行にする）:
--   DELETE FROM trash_items WHERE deleted_at < now() - interval '90 days';
