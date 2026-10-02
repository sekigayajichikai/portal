-- =====================================================
-- 公開前の確認リンクを、合言葉（token）だけで通す関数にする
-- =====================================================
-- 回覧板ポータルのテーブルを守るとき、いちばんの難所がここだった。
--
-- 確認リンク（/review/<token>）は**ログイン不要**で、まだ公開していない号を見せる。
-- いまは回覧板を全件取ってきて画面側で絞っているので、
-- 「公開済みだけ読める」という制限をかけると確認ページが壊れる。
--
-- そこで、合言葉を引数に取って**その1件だけ**を返す関数を用意する。
-- 関数は中だけ特権で動く（SECURITY DEFINER）ので、テーブルを閉じたあとも使える。
-- 合言葉を知らない人は、何も取れない。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- =====================================================

-- 1) 合言葉から回覧板を1件返す
CREATE OR REPLACE FUNCTION get_newsletter_by_review_token(p_token TEXT)
RETURNS SETOF newsletters
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM newsletters
  WHERE review_token IS NOT NULL
    AND review_token = p_token
  LIMIT 1;
$$;

-- 2) 合言葉から、その号の記事を返す
CREATE OR REPLACE FUNCTION get_articles_by_review_token(p_token TEXT)
RETURNS SETOF articles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.* FROM articles a
  JOIN newsletters n ON n.id = a.newsletter_id
  WHERE n.review_token IS NOT NULL
    AND n.review_token = p_token;
$$;

-- 3) 合言葉から、その号の予定カードを返す
CREATE OR REPLACE FUNCTION get_event_cards_by_review_token(p_token TEXT)
RETURNS SETOF event_cards
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.* FROM event_cards e
  JOIN newsletters n ON n.id = e.newsletter_id
  WHERE n.review_token IS NOT NULL
    AND n.review_token = p_token;
$$;

-- 4) 担当者の判定を保存する（確認待ちのときだけ受け付ける）
CREATE OR REPLACE FUNCTION submit_review_by_token(
  p_token    TEXT,
  p_verdict  TEXT,
  p_comment  TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT NULL
)
RETURNS SETOF newsletters
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_verdict NOT IN ('approved', 'changes_requested') THEN
    RAISE EXCEPTION '判定の値が正しくありません';
  END IF;

  RETURN QUERY
  UPDATE newsletters
  SET review_status  = p_verdict,
      reviewed_at    = NOW(),
      review_comment = NULLIF(btrim(coalesce(p_comment, '')), ''),
      reviewer_name  = NULLIF(btrim(coalesce(p_reviewer, '')), '')
  WHERE review_token IS NOT NULL
    AND review_token = p_token
    AND review_status = 'pending'
  RETURNING *;
END;
$$;

-- 5) 実行できる相手をはっきりさせる
REVOKE ALL ON FUNCTION get_newsletter_by_review_token(TEXT)   FROM PUBLIC;
REVOKE ALL ON FUNCTION get_articles_by_review_token(TEXT)     FROM PUBLIC;
REVOKE ALL ON FUNCTION get_event_cards_by_review_token(TEXT)  FROM PUBLIC;
REVOKE ALL ON FUNCTION submit_review_by_token(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_newsletter_by_review_token(TEXT)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_articles_by_review_token(TEXT)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_event_cards_by_review_token(TEXT)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_review_by_token(TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;

-- 6) 確認（合言葉が空のときは何も返らないこと）
SELECT count(*) AS 空の合言葉で取れる件数 FROM get_newsletter_by_review_token('');
