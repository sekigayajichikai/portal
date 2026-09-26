-- =====================================================
-- 会場マスター（venues）を新設し、既存の予定カードの場所表記を正式名に寄せる
-- =====================================================
-- 予定カードの実施場所（event_cards.event_location）は AI 抽出のたびに表記が揺れる
-- （自治会館1階会議室／自治会館 1F会議室／自治会館1F会議室 など）。
-- 主催団体（organizers）と同じ考え方で会場を事前登録し、
--   - 抽出時に AI へ登録名を渡して表記を揃える
--   - 抽出ダイアログの場所欄で候補から選べる
--   - 別名（aliases）に当たる表記は自動で正式名に置き換える
-- ようにする。管理は管理画面の「マスタ」タブ。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run
-- 冪等: テーブルは IF NOT EXISTS、初期データは ON CONFLICT DO NOTHING、置き換えは別名に一致する行だけ。
-- =====================================================

CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id TEXT,
  name TEXT NOT NULL UNIQUE,                 -- 正式名（施設名＋部屋名。例: 西金沢コミュニティハウス 2階）
  aliases TEXT[] NOT NULL DEFAULT '{}',      -- 別名・揺れた表記（これに一致したら正式名に置き換える）
  display_order INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
COMMENT ON TABLE venues IS '会場マスター（予定カードの実施場所。別名は正式名に自動で寄せる）';

-- 初期データ（2026-09-26 時点の予定カードに出ていた場所から。管理画面の「マスタ」タブで変更できる）
INSERT INTO venues (name, aliases, display_order) VALUES
  ('自治会館',                              ARRAY['関ヶ谷自治会館', '関ケ谷自治会館'], 10),
  ('自治会館 1階会議室',                    ARRAY['自治会館1階会議室', '自治会館 1F会議室', '自治会館1F会議室', '自治会館 会議室'], 11),
  ('西金沢コミュニティハウス',              ARRAY['コミュニティハウス', '西金沢コミハ', 'コミハ'], 20),
  ('西金沢コミュニティハウス 2階',          ARRAY['コミュニティハウス 2階', 'コミュニティハウス2階', '西金沢コミュニティハウス2階'], 21),
  ('西金沢コミュニティハウス 多目的室',     ARRAY['コミュニティハウス 多目的室'], 22),
  ('西金沢地域ケアプラザ',                  ARRAY['ケアプラザ', '西金沢ケアプラザ', '地域ケアプラザ'], 30),
  ('西金沢地域ケアプラザ 多目的ホール',     ARRAY['西金沢地域ケアプラザ 2階多目的ホール', 'ケアプラザ 多目的ホール', 'ケアプラザ多目的ホール', '西金沢地域ケアプラザ多目的ホール'], 31),
  ('西金沢地域ケアプラザ 2階調理室',        ARRAY['ケアプラザ 調理室', '西金沢地域ケアプラザ 調理室'], 32),
  ('奥座公園',                              ARRAY[]::TEXT[], 40),
  ('金沢文庫駅',                            ARRAY[]::TEXT[], 41)
ON CONFLICT (name) DO NOTHING;

-- 既存の予定カードの場所を、別名に一致するものだけ正式名に置き換える
UPDATE event_cards e
SET event_location = v.name
FROM venues v
WHERE e.event_location = ANY (v.aliases);

SELECT event_location, count(*) AS n
FROM event_cards
WHERE event_location IS NOT NULL
GROUP BY event_location
ORDER BY n DESC, event_location;
