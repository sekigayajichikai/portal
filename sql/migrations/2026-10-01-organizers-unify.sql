-- =====================================================
-- 主催団体(organizers)と発行元(publishers)を「団体マスタ」に一本化する
-- =====================================================
-- これまで団体の名前が3箇所に散らばっていた。
--   organizers  … 予定カードの主催（3件）
--   publishers  … 回覧板PDFの発行元（6件）
--   （カレンダー側の booking_organizations は会館を借りるアカウントなので別物。触らない）
-- そのため、紙面に出る外部団体（ケアプラザ・地区センター・警察署など）の置き場所がなく、
-- 主催欄が毎回手入力になって誤字や表記ゆれが通っていた（「金利谷地区センター」など）。
--
-- organizers を団体マスタに広げ、publishers の中身を取り込む。
--   - aliases          … 会場マスタ(venues)と同じ。別名・ゆれ・誤字を正式名に自動で寄せる
--   - use_as_organizer … 予定の主催の候補に出す
--   - use_as_publisher … 回覧板PDFの発行元の候補に出す
-- publishers テーブルは消さずに残す（コードはもう読まない）。問題がなければ後日削除する。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 冪等: 列追加は IF NOT EXISTS、初期データは ON CONFLICT、置き換えは別名に一致する行だけ。
-- =====================================================

-- 1) 団体マスタに列を足す
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS use_as_organizer BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS use_as_publisher BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON TABLE organizers IS '団体マスタ（予定の主催・回覧板の発行元。別名は正式名に自動で寄せる）';

-- 2) 発行元(publishers)を取り込む。すでに同じ名前があれば発行元フラグを立てるだけ。
INSERT INTO organizers (name, short_name, display_order, use_as_organizer, use_as_publisher)
SELECT p.name, p.short_name, COALESCE(p.display_order, 100) + 200, TRUE, TRUE
FROM publishers p
ON CONFLICT (name) DO UPDATE SET use_as_publisher = TRUE;

-- 3) 紙面に出ていたのにマスタに無かった団体を足す
--    （2026-10-01 時点の予定カード70件の主催から。誤字・略称は別名に入れる）
INSERT INTO organizers (name, aliases, display_order, use_as_organizer, use_as_publisher) VALUES
  ('関ヶ谷自治会',           ARRAY['自治会']::TEXT[],                        10, TRUE,  TRUE),
  ('関ヶ谷クラブ',           ARRAY['関ケ谷クラブ']::TEXT[],                  20, TRUE,  FALSE),
  ('ふれあいの会',           ARRAY[]::TEXT[],                                21, TRUE,  FALSE),
  ('関ヶ谷こども会',         ARRAY['関ヶ谷子供会', '関ケ谷子供会', '関ケ谷こども会']::TEXT[], 22, TRUE, FALSE),
  ('西金沢地域ケアプラザ',   ARRAY['ケアプラザ', '西金沢ケアプラザ', '地域ケアプラザ']::TEXT[], 30, TRUE, TRUE),
  ('釜利谷地区センター',     ARRAY['金利谷地区センター', '地区センター']::TEXT[], 31, TRUE, TRUE),
  ('地域包括支援センター',   ARRAY[]::TEXT[],                                32, TRUE,  FALSE),
  ('横浜南共済病院',         ARRAY[]::TEXT[],                                40, TRUE,  FALSE),
  ('横浜市選挙管理委員会',   ARRAY[]::TEXT[],                                41, TRUE,  FALSE),
  ('金沢警察署交通安全課',   ARRAY[]::TEXT[],                                42, TRUE,  FALSE),
  ('金沢区生涯学習交流会',   ARRAY[]::TEXT[],                                43, TRUE,  FALSE),
  ('ブルースター横浜',       ARRAY[]::TEXT[],                                44, TRUE,  FALSE)
ON CONFLICT (name) DO UPDATE
  SET aliases = ARRAY(SELECT DISTINCT UNNEST(organizers.aliases || EXCLUDED.aliases)),
      use_as_organizer = organizers.use_as_organizer OR EXCLUDED.use_as_organizer,
      use_as_publisher = organizers.use_as_publisher OR EXCLUDED.use_as_publisher,
      -- 自治会・自治会の中の会・近隣の団体…の順に並べたいので、ここで指定した順を優先する
      display_order = EXCLUDED.display_order;

-- 4) 略称(short_name)が別名の役割をしていたので、別名にも入れておく
--    （例: 金沢区社会福祉協議会 の「金沢区社協」）
UPDATE organizers o
SET aliases = ARRAY(SELECT DISTINCT UNNEST(o.aliases || ARRAY[o.short_name]))
WHERE o.short_name IS NOT NULL
  AND o.short_name <> ''
  AND NOT (o.short_name = ANY (o.aliases));

-- 5) 既存の予定カードの主催を、別名に一致するものだけ正式名に置き換える
UPDATE event_cards e
SET organizer = o.name
FROM organizers o
WHERE e.organizer = ANY (o.aliases);

-- 6) 確認
SELECT name, aliases, use_as_organizer AS 主催, use_as_publisher AS 発行元, display_order
FROM organizers ORDER BY display_order, name;
