-- =====================================================
-- 週次配信の下書き weekly_digest_drafts を追加
-- =====================================================
-- 週次配信タブで人が決めたこと（⭐一押しの選択・この週だけ外した予定・リンク先・手で直した文・画像の種類）を
-- 配信日ごとに自動保存し、次に開いたとき（別の端末でも）同じ状態に戻す（docs/週次配信.md）。
-- 紹介文と画像の切り出しは event_cards 側に保存されるのでここには入れない。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 冪等: IF NOT EXISTS なので再実行しても安全。未作成でも画面は動く（下書きが残らないだけ）。
-- =====================================================

CREATE TABLE IF NOT EXISTS weekly_digest_drafts (
  base_date DATE PRIMARY KEY,                 -- 配信日（週の起点）。1週に1つ
  topic_ids JSONB,                            -- null=自動 / []=一押しなし / ["予定ID",...]=選んだ順
  excluded_ids JSONB NOT NULL DEFAULT '[]',   -- この週だけ外した予定ID
  link_kinds JSONB NOT NULL DEFAULT '{}',     -- 予定ID → 'pdf' | 'article'
  greeting TEXT,                              -- 吹き出し①の文（手で直したときだけ。null=自動）
  text TEXT,                                  -- コピー用の文面（手で直したときだけ。null=自動）
  image_mode TEXT,                            -- flyer / topic / hybrid / list
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE weekly_digest_drafts IS '週次配信（今週のお知らせ）の下書き。配信日ごとに1行、画面から自動保存';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'weekly_digest_drafts';
