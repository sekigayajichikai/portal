-- =====================================================
-- LINE リッチメニューの定義 line_rich_menus を追加
-- =====================================================
-- 管理画面「リッチメニュー」タブで作ったメニュー（レイアウト・タイル・画像・LINE側のID）を保存し、
-- あとから編集・再登録・タブ切替（エイリアス）に使う（docs/リッチメニュー.md）。
--
-- 実行手順: Supabase ダッシュボード → SQL Editor → このファイル全体を貼り付けて Run（2026-09-21 に MCP で適用済み）
-- 冪等: IF NOT EXISTS なので再実行しても安全。
-- =====================================================

CREATE TABLE IF NOT EXISTS line_rich_menus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,                   -- 管理用の名前（例: 通常メニュー / 登録促進 / 防災訓練）
  definition JSONB NOT NULL,            -- エディタの定義（テンプレート・タイル・色・タブ）
  image_url TEXT,                       -- 生成／アップロードした画像の公開URL
  line_rich_menu_id TEXT,               -- LINE に登録したときの richMenuId
  alias_id TEXT,                        -- タブ切替用のエイリアスID
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
COMMENT ON TABLE line_rich_menus IS 'LINE リッチメニューの定義（管理画面で作成。LINE側のIDも保持）';

SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'line_rich_menus';
