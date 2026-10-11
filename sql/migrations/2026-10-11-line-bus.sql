-- =====================================================
-- 公式LINEのバス時刻表を Edge Function line-webhook で答えるためのテーブル
-- =====================================================
-- これまで名簿GAS（BusTimetable.js）がスプレッドシートを読んで答えていたのを、Supabase で答えて速くする。
-- 時刻表・特別ダイヤ・祝日は、名簿GASの syncBusToSupabase がシートと Google カレンダーから毎日写す（元はシートのまま）。
-- 各人のバス設定（保存した行き方）は、切り替え後はここが元になる（切り替え時にシートから一度だけ取り込む）。
-- 仕様: docs/バス時刻表.md
--
-- 実行手順: SQL Editor にこのファイル全体を貼り付けて Run（または supabase db query -f）
-- 冪等: 再実行しても安全（IF NOT EXISTS）
-- 読み書きは Edge Function（サービスロール）だけ。LINE のユーザーIDを含むので画面からは読めないようにする（ポリシーなし）
-- =====================================================

-- 時刻表（シート「バス時刻表」の1行 = 1行）
CREATE TABLE IF NOT EXISTS bus_timetable (
  row_order INTEGER PRIMARY KEY,          -- シートの行の順（停留所の並び順に使う）
  direction TEXT NOT NULL,                -- 往路（金沢文庫駅 行き）／復路（野村住宅センター 行き）
  day_type TEXT NOT NULL,                 -- 平日／土休日
  stop_name TEXT NOT NULL,
  times TEXT[] NOT NULL DEFAULT '{}',     -- ["06:35", "06:55", ...]（並べ替え済み）
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
COMMENT ON TABLE bus_timetable IS 'バス時刻表（名簿GASがシートから毎日写す）';
CREATE INDEX IF NOT EXISTS idx_bus_timetable_lookup ON bus_timetable (direction, day_type, stop_name);

-- 特別ダイヤ（夏休み・年末年始など。シート「特別ダイヤ」）
CREATE TABLE IF NOT EXISTS bus_special_days (
  id SERIAL PRIMARY KEY,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  day_type TEXT NOT NULL CHECK (day_type IN ('平日', '土休日')),
  memo TEXT
);
COMMENT ON TABLE bus_special_days IS 'バスの特別ダイヤ期間（名簿GASがシートから毎日写す）';

-- 祝日（Google の日本の祝日カレンダーから、名簿GASが1年先まで写す）
CREATE TABLE IF NOT EXISTS bus_holidays (
  date DATE PRIMARY KEY,
  name TEXT
);
COMMENT ON TABLE bus_holidays IS '祝日（土休日ダイヤの判定用）';

-- 各人のバス設定（保存した行き方。1人3つまで。id の小さい順に表示し、1つ目を「バス」で最初に出す）
CREATE TABLE IF NOT EXISTS bus_user_settings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL,                  -- LINE のユーザーID
  pattern_name TEXT NOT NULL,             -- 行き・帰り・自分でつけた名前
  direction TEXT NOT NULL,
  stop_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, pattern_name)
);
COMMENT ON TABLE bus_user_settings IS '公式LINEのバス設定（保存した行き方）';

-- 名前変更の入力待ち（「名前変更」を押してから30秒）
CREATE TABLE IF NOT EXISTS bus_rename_pending (
  user_id TEXT PRIMARY KEY,
  old_name TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
COMMENT ON TABLE bus_rename_pending IS 'バス設定の名前変更の入力待ち';

ALTER TABLE bus_timetable ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_special_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_rename_pending ENABLE ROW LEVEL SECURITY;

-- 確認
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'bus\_%' ORDER BY table_name;
