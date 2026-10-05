-- =====================================================
-- 団体の名簿を booking_organizations に一本化する（第1段: 足すだけ）
-- =====================================================
-- これまで団体の名簿が2つあった。
--   organizers             … portal の主催・発行元（15件。外部団体を含む。別名で表記ゆれを吸収）
--   booking_organizations  … book-system の団体マスタ（109件。会館を借りる団体のアカウント）
-- 名前が合わない（関ヶ谷自治会 ⇔ 自治会、関ヶ谷クラブ ⇔ 関ケ谷クラブ）うえ、外部団体が
-- booking_organizations に無いので、カレンダーの団体絞り込みで回覧板の予定の多くが「未分類」になっていた。
--
-- booking_organizations を唯一の団体マスタにする。予約・パスコード・予定がすでにここへ
-- org_id でつながっているので、こちらを残す。
--
-- 決めたこと（2026-10-05）
--   - 自治会の正式名は「関ヶ谷自治会」（「自治会」は別名）
--   - 「関ケ谷／関ｹ谷」は「関ヶ谷」に統一（元の表記は別名と取込キーワードに残す）
--   - 主催の候補（use_as_organizer）の初期値: 自治会・委員会・自主活動部の活動中の団体＋外部団体
--   - 外部団体はグループ「地域の団体・施設」に入れ、会館は予約しない（can_book = false）
--
-- この段では organizers は消さない（portal はまだ organizers を読む）。portal を切り替えたあとで消す。
--
-- 前提: book-system の「新しく出てきた団体は絞り込みで自動的にON」の修正が本番に出ていること。
--       （出ていないと、絞り込みを保存済みの住民の画面で改名・追加した団体の予定が見えなくなる）
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 冪等: 列追加は IF NOT EXISTS、追加は NOT EXISTS、改名は旧名の行がある時だけ。何度流しても同じ結果になる。
-- =====================================================

BEGIN;

-- 表記ゆれの吸収（portal の resolveOrganizerName と同じ考え方: 空白を消し、ケ/ｹ をヶに寄せる）
CREATE OR REPLACE FUNCTION pg_temp.norm_org(s TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(regexp_replace(COALESCE(s, ''), '[\s　]', '', 'g'), 'ケｹ', 'ヶヶ')
$$;

-- 1) 列を足す
ALTER TABLE booking_organizations ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE booking_organizations ADD COLUMN IF NOT EXISTS use_as_organizer BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE booking_organizations ADD COLUMN IF NOT EXISTS use_as_publisher BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE booking_organizations ADD COLUMN IF NOT EXISTS can_book BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE booking_organizations ADD COLUMN IF NOT EXISTS display_order INTEGER;
COMMENT ON COLUMN booking_organizations.aliases IS '別名・表記ゆれ・誤字。正式名(name)に自動で寄せる（keywords は取込で題名から探す語で、役割が違う）';
COMMENT ON COLUMN booking_organizations.use_as_organizer IS '回覧板の予定の主催の候補に出す';
COMMENT ON COLUMN booking_organizations.use_as_publisher IS '回覧板PDFの発行元の候補に出す';
COMMENT ON COLUMN booking_organizations.can_book IS '会館を予約する団体か（外部団体は false）';
COMMENT ON COLUMN booking_organizations.display_order IS '主催・発行元の候補の並び順（portal の organizers.display_order を引き継ぐ）';

-- 2) 外部団体のグループを足す（「その他」より前に置く）
INSERT INTO booking_org_groups (name, sort_order, default_tier)
SELECT '地域の団体・施設', 6, '3'
WHERE NOT EXISTS (SELECT 1 FROM booking_org_groups WHERE name = '地域の団体・施設');
UPDATE booking_org_groups SET sort_order = 7 WHERE name = 'その他' AND sort_order = 6;

-- 3) 改名する。旧名は別名(aliases)と取込キーワード(keywords)に残し、Excel 取込の団体判定が変わらないようにする
--    3-1) 自治会 → 関ヶ谷自治会
UPDATE booking_organizations
SET aliases  = ARRAY(SELECT DISTINCT UNNEST(aliases  || ARRAY[name])),
    keywords = ARRAY(SELECT DISTINCT UNNEST(COALESCE(keywords, '{}') || ARRAY[name])),
    name = '関ヶ谷自治会',
    updated_at = now()
WHERE name = '自治会';

--    3-2) 関ケ谷／関ｹ谷 → 関ヶ谷
UPDATE booking_organizations
SET aliases  = ARRAY(SELECT DISTINCT UNNEST(aliases  || ARRAY[name])),
    keywords = ARRAY(SELECT DISTINCT UNNEST(COALESCE(keywords, '{}') || ARRAY[name])),
    name = replace(replace(name, '関ケ谷', '関ヶ谷'), '関ｹ谷', '関ヶ谷'),
    updated_at = now()
WHERE name LIKE '%関ケ谷%' OR name LIKE '%関ｹ谷%';

-- 4) portal の団体(organizers)を突き合わせる
--    4-1) 同じ団体がある → 別名・主催/発行元・並び順を引き継ぐ
UPDATE booking_organizations b
SET aliases = ARRAY(SELECT DISTINCT UNNEST(b.aliases || o.aliases || CASE WHEN o.short_name <> '' THEN ARRAY[o.short_name] ELSE '{}'::TEXT[] END)),
    use_as_organizer = b.use_as_organizer OR o.use_as_organizer,
    use_as_publisher = b.use_as_publisher OR o.use_as_publisher,
    display_order = COALESCE(b.display_order, o.display_order),
    updated_at = now()
FROM organizers o
WHERE pg_temp.norm_org(b.name) = pg_temp.norm_org(o.name);

--    4-2) 無い団体（外部団体）→ 新しく足す。会館は予約しない
INSERT INTO booking_organizations
  (name, group_name, category, is_active, aliases, use_as_organizer, use_as_publisher, can_book, display_order, keywords, default_equipment, presets)
SELECT o.name, '地域の団体・施設', '3', TRUE,
       ARRAY(SELECT DISTINCT UNNEST(o.aliases || CASE WHEN o.short_name <> '' THEN ARRAY[o.short_name] ELSE '{}'::TEXT[] END)),
       o.use_as_organizer, o.use_as_publisher, FALSE, o.display_order, '{}', '{}', '{}'
FROM organizers o
WHERE NOT EXISTS (
  SELECT 1 FROM booking_organizations b
  WHERE pg_temp.norm_org(b.name) = pg_temp.norm_org(o.name)
     OR pg_temp.norm_org(o.name) = ANY (SELECT pg_temp.norm_org(a) FROM UNNEST(b.aliases) a)
);

-- 5) 主催の候補の初期値: 自治会・委員会・自主活動部の活動中の団体
UPDATE booking_organizations
SET use_as_organizer = TRUE, updated_at = now()
WHERE group_name IN ('自治会', '委員会', '自主活動部')
  AND is_active IS NOT FALSE
  AND use_as_organizer = FALSE;

-- 6) カレンダーの回覧板の予定・手入力の予定に org_id を入れ、主催名を正式名にそろえる
--    （会館予約由来の facility は予約側の org_id で団体が決まるので触らない）
UPDATE calendar_events e
SET org_id = b.id,
    org_name = b.name,
    updated_at = now()
FROM booking_organizations b
WHERE e.event_type = 'general'
  AND e.org_name IS NOT NULL
  AND (pg_temp.norm_org(e.org_name) = pg_temp.norm_org(b.name)
       OR pg_temp.norm_org(e.org_name) = ANY (SELECT pg_temp.norm_org(a) FROM UNNEST(b.aliases) a))
  AND (e.org_id IS DISTINCT FROM b.id OR e.org_name IS DISTINCT FROM b.name);

COMMIT;

-- 7) 確認
--    7-1) portal の団体がすべて対応づいたか（0行なら OK）
SELECT o.name AS 対応なし
FROM organizers o
WHERE NOT EXISTS (
  SELECT 1 FROM booking_organizations b
  WHERE pg_temp.norm_org(b.name) = pg_temp.norm_org(o.name)
     OR pg_temp.norm_org(o.name) = ANY (SELECT pg_temp.norm_org(a) FROM UNNEST(b.aliases) a)
);

--    7-2) カレンダーの一般予定の主催が、団体マスタにつながったか
SELECT (org_id IS NOT NULL) AS つながった, COUNT(*)
FROM calendar_events WHERE event_type = 'general' GROUP BY 1;
