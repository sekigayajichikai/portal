-- 主催団体マスター（organizers）を新設
-- 発行元(publishers)とは別概念。イベントの主催団体を事前登録し、
-- 抽出ダイアログでクリック選択できるようにする（表記揺れの低減が目的）。
-- publishers と同じ構造。追加のみの安全なマイグレーション。

CREATE TABLE IF NOT EXISTS organizers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id TEXT,
  name TEXT NOT NULL UNIQUE,
  short_name TEXT,
  display_order INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE organizers IS '主催団体マスター（イベントの主催者。発行元publishersとは別）';
