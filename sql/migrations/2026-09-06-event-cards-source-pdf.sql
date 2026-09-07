-- イベントカードに「由来PDF」列を追加
-- PDFから抽出したイベントが、号の先頭PDFではなく実際の抽出元PDFへ
-- リンクできるようにする（複数PDFの号での出典迷子を防ぐ）。
-- 追加のみの安全なマイグレーション。

ALTER TABLE event_cards ADD COLUMN IF NOT EXISTS source_pdf_url TEXT;

COMMENT ON COLUMN event_cards.source_pdf_url IS 'このイベントの抽出元PDFのURL（PDF抽出時のみ。記事由来はNULL）';
