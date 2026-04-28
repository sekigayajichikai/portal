-- =====================================================
-- バス時刻表テーブルセットアップスクリプト
-- =====================================================
-- このスクリプトをSupabaseのSQL Editorで実行してください
--
-- 目的: コミュニティバスの時刻表を管理するための
--       bus_schedules テーブルを作成します
-- =====================================================

-- バス時刻表テーブル（平日/休日別の時刻データをJSON形式で保存）
CREATE TABLE IF NOT EXISTS bus_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID,

  -- 基本情報
  route_name TEXT NOT NULL,           -- 路線名（例: "駅方面"）
  stop_name TEXT NOT NULL,            -- バス停名（例: "自治会館前"）
  destination TEXT,                   -- 行き先（例: "中央駅前"）

  -- 時刻データ（JSON形式）
  -- { "weekday": ["08:00", "09:30"], "holiday": ["09:00", "11:00"] }
  schedule_data JSONB NOT NULL,

  -- メタ情報
  source_pdf_url TEXT,                -- 元PDFのURL
  valid_from DATE,                    -- 有効期間開始
  valid_until DATE,                   -- 有効期間終了
  notes TEXT,                         -- 備考（運休情報など）

  -- 表示制御
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_bus_schedules_organization_id ON bus_schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_bus_schedules_is_active ON bus_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_bus_schedules_display_order ON bus_schedules(display_order);
CREATE INDEX IF NOT EXISTS idx_bus_schedules_route_name ON bus_schedules(route_name);

-- コメント追加（ドキュメント化）
COMMENT ON TABLE bus_schedules IS 'コミュニティバスの時刻表を管理するテーブル';
COMMENT ON COLUMN bus_schedules.route_name IS '路線名（例: 駅方面、市民病院方面）';
COMMENT ON COLUMN bus_schedules.stop_name IS 'バス停名（例: 自治会館前、中央公園）';
COMMENT ON COLUMN bus_schedules.destination IS '行き先（例: 中央駅前）';
COMMENT ON COLUMN bus_schedules.schedule_data IS '時刻データ（JSON形式）: { weekday: [時刻配列], holiday: [時刻配列] }';
COMMENT ON COLUMN bus_schedules.source_pdf_url IS 'アップロードされた元PDFのURL';
COMMENT ON COLUMN bus_schedules.valid_from IS '時刻表の有効期間開始日';
COMMENT ON COLUMN bus_schedules.valid_until IS '時刻表の有効期間終了日';
COMMENT ON COLUMN bus_schedules.notes IS '備考（運休情報、注意事項など）';
COMMENT ON COLUMN bus_schedules.display_order IS '表示順序（小さい値が先に表示される）';
COMMENT ON COLUMN bus_schedules.is_active IS 'アクティブフラグ（false=無効化された時刻表）';

-- =====================================================
-- セットアップ完了！
-- =====================================================
-- 次のステップ:
-- 1. 実行が成功したか確認（エラーがないこと）
-- 2. 左メニューの「Table Editor」でテーブルが作成されたことを確認
-- 3. 管理画面からバス時刻表のPDFをアップロードして登録
-- =====================================================
