-- =====================================================
-- ラジオ番組テーブル セットアップスクリプト
-- =====================================================
-- このスクリプトをSupabaseのSQL Editorで実行してください
--
-- 実行手順:
-- 1. Supabaseダッシュボード (https://supabase.com) にログイン
-- 2. プロジェクトを選択
-- 3. 左メニューから「SQL Editor」を開く
-- 4. 「New query」をクリック
-- 5. このスクリプト全体をコピー＆ペースト
-- 6. 「Run」ボタンをクリック
-- =====================================================

-- ラジオ番組テーブル
CREATE TABLE IF NOT EXISTS radio_programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsletter_id UUID REFERENCES newsletters(id) ON DELETE CASCADE,
  organization_id UUID,

  -- 番組情報
  title TEXT NOT NULL,                    -- "2025年1月号 ラジオ版"
  description TEXT,                       -- 番組の説明
  duration_seconds INTEGER,               -- 長さ（秒）

  -- 生成データ
  script TEXT NOT NULL,                   -- 生成された台本（2人の掛け合い）
  audio_url TEXT,                         -- Supabase Storage URL
  audio_filename TEXT,                    -- ファイル名

  -- 生成情報
  generation_status TEXT DEFAULT 'pending' CHECK (generation_status IN ('pending', 'generating', 'completed', 'failed')),
  generation_error TEXT,                  -- エラーメッセージ（失敗時）
  generated_at TIMESTAMP WITH TIME ZONE,  -- 生成完了日時

  -- メタデータ
  article_count INTEGER,                  -- 使用した記事数
  segment_count INTEGER,                  -- セグメント数（オープニング、メイン、エンディング）
  model_version TEXT,                     -- 使用したモデル（例: gemini-2.0-flash）

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_radio_programs_newsletter_id ON radio_programs(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_radio_programs_status ON radio_programs(generation_status);
CREATE INDEX IF NOT EXISTS idx_radio_programs_created_at ON radio_programs(created_at DESC);

-- コメント追加（ドキュメント化）
COMMENT ON TABLE radio_programs IS 'AIが生成したラジオ番組を管理するテーブル';
COMMENT ON COLUMN radio_programs.title IS 'ラジオ番組のタイトル（例: 2025年1月号 ラジオ版）';
COMMENT ON COLUMN radio_programs.script IS '2人のDJの掛け合い台本（A: と B: で話者を区別）';
COMMENT ON COLUMN radio_programs.audio_url IS 'Supabase Storageに保存された音声ファイルのURL';
COMMENT ON COLUMN radio_programs.generation_status IS 'ステータス: pending=待機中, generating=生成中, completed=完了, failed=失敗';
COMMENT ON COLUMN radio_programs.segment_count IS 'セグメント数（通常は3: オープニング、メイン、エンディング）';

-- =====================================================
-- セットアップ完了！
-- =====================================================
-- 次のステップ:
-- 1. 実行が成功したか確認（エラーがないこと）
-- 2. 左メニューの「Table Editor」でテーブルが作成されたことを確認
-- 3. Supabase Storageで「radio」バケットを作成
-- 4. アプリケーションからラジオ番組生成機能を試してみる
-- =====================================================
