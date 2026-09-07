-- イベントカードに「種別」列を追加
-- カレンダーでの見せ方を種別ごとに変えるため。
--   'reserve'   … 予約・申込が必要（対象が限られる。地区センター講座 等）
--   'recurring' … 連続・定期（毎週の習い事・体操教室・連続講座 等）
--   'open'      … 当日自由参加（お祭り・サロン 等。集客したい）
--   NULL        … 一般（特に指定なし）
-- 追加のみの安全なマイグレーション。

ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS category TEXT;

COMMENT ON COLUMN event_cards.category IS 'イベント種別: reserve(要予約) / recurring(連続) / open(当日参加OK) / NULL(一般)';
