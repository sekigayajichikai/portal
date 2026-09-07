-- イベントカードに主催団体（organizer）列を追加
-- 回覧板の記事／PDFからAIが抽出したイベントの主催団体を保存する。
-- 追加のみの安全なマイグレーション（既存データに影響なし）。

ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS organizer TEXT;

COMMENT ON COLUMN event_cards.organizer IS '主催団体・主催者（AI抽出。不明ならNULL）';
