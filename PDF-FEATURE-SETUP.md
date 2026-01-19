# PDF記事抽出機能 セットアップガイド

このガイドでは、新しく追加されたPDF記事抽出機能の使用方法を説明します。

## 実装された機能

### Stage 1: モックデータとUI（完了✅）

- ✅ 型定義（Newsletter, Article）の作成
- ✅ モックデータの追加
- ✅ ArticleListコンポーネント（記事一覧表示）
- ✅ CircularBoard拡張（タブUI、PDF広報誌セクション）
- ✅ 4段階要約の切り替え表示
- ✅ 優先度別の色分け表示
- ✅ カテゴリフィルター

### Stage 2: Claude API統合（完了✅）

- ✅ Claude APIサービスの実装
- ✅ PDFファイルのBase64変換
- ✅ 記事抽出プロンプト設計
- ✅ エラーハンドリング（APIキー未設定時はモックにフォールバック）

### Stage 3: Supabase統合（準備完了✅）

- ✅ Supabaseクライアントの実装
- ⏳ データベーステーブル作成（手動セットアップが必要）

## 使用方法

### 1. 環境変数の設定

`.env`ファイルを作成し、以下の環境変数を設定してください：

#### オプション A: Claude API（Anthropic直接）

```env
# AI Provider（auto, anthropic, openrouter から選択）
VITE_AI_PROVIDER=anthropic

# Claude AI（Anthropic直接利用）
VITE_ANTHROPIC_API_KEY=your_api_key_here

# Supabase（オプション - データ永続化用）
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key

# Gemini AI（既存機能用）
VITE_GEMINI_API_KEY=your_gemini_key
```

#### オプション B: OpenRouter（推奨・コスト削減）

```env
# AI Provider（auto, anthropic, openrouter から選択）
VITE_AI_PROVIDER=openrouter

# OpenRouter API（複数のAIモデルを統一的に利用）
VITE_OPENROUTER_API_KEY=your_openrouter_key_here

# 使用するモデル（オプション、デフォルト: Claude Sonnet 4）
VITE_OPENROUTER_MODEL=anthropic/claude-sonnet-4-20250514

# Supabase（オプション - データ永続化用）
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key

# Gemini AI（既存機能用）
VITE_GEMINI_API_KEY=your_gemini_key
```

#### オプション C: 自動選択（おすすめ）

両方のAPIキーを設定しておくと、自動的に利用可能なプロバイダーを選択します：

```env
# AI Provider（auto: 利用可能なプロバイダーを自動選択）
VITE_AI_PROVIDER=auto

# Claude AI（Anthropic直接）
VITE_ANTHROPIC_API_KEY=your_anthropic_key

# OpenRouter API
VITE_OPENROUTER_API_KEY=your_openrouter_key

# その他の設定...
```

### 2. API Key の取得方法

#### Claude API（Anthropic直接）

1. [console.anthropic.com](https://console.anthropic.com) にアクセス
2. アカウント作成・ログイン
3. 左メニュー「API Keys」→「Create Key」
4. 生成されたキーをコピーして`.env`に設定

**料金の目安:**
- 1PDF（10-20記事）の処理: 約$0.10-0.20
- 処理時間: 20-60秒程度

#### OpenRouter API（おすすめ）

1. [openrouter.ai](https://openrouter.ai) にアクセス
2. アカウント作成・ログイン
3. 右上のアカウントメニュー → 「Keys」
4. 「Create Key」をクリック
5. 生成されたキーをコピーして`.env`に設定

**メリット:**
- 💰 コスト削減の可能性（プロバイダー間の価格競争）
- 🔄 複数のAIモデルを同じAPIで利用可能
- 🛡️ フォールバック機能（あるモデルが使えない時に自動切り替え）
- 📊 統一された使用量管理

**利用可能なモデル例:**
- `anthropic/claude-sonnet-4-20250514` (デフォルト)
- `anthropic/claude-3.5-sonnet`
- `openai/gpt-4-turbo`
- `google/gemini-pro-1.5`

**注意点:**
- OpenRouterがPDF直接読み込みに対応していない場合があります
- その場合、自動的にAnthropicにフォールバックします

### 3. 管理画面での使用

1. 管理画面を起動: `npm run dev`
2. 「デジタル回覧板」セクションに移動
3. **「PDF広報誌」タブ**をクリック
4. 以下の手順で記事を抽出：
   - タイトルを入力（例: 2025年1月号）
   - PDFファイルを選択（最大10MB）
   - 「記事を抽出」ボタンをクリック
   - 20-60秒待機（Claude AIが記事を解析）
   - 抽出された記事がプレビュー表示されます

### 4. 記事の表示機能

#### 詳細度の切り替え

- **見出し**: 5文字（例: どんど焼き）
- **簡潔**: 15文字程度（例: 1/10どんど焼き開催）
- **要約**: 40文字程度（いつ・どこで・何を）
- **全文**: 記事の本文全体

#### 優先度別の色分け

- 🔴 **重要（high）**: 締切あり、要対応事項
- 🟡 **確認推奨（medium）**: イベント告知、お知らせ
- ⚪ **参考情報（low）**: 報告、読み物

#### カテゴリフィルター

- 🎉 イベント
- 📢 お知らせ
- 📋 会議
- 📚 文化
- 📊 報告

### 5. プロバイダー選択の仕組み

システムは以下の優先順位でAIプロバイダーを選択します：

1. **明示的な指定**: `VITE_AI_PROVIDER` で指定されたプロバイダー
2. **自動選択**: 利用可能なAPIキーに基づいて自動選択（Anthropic優先）
3. **フォールバック**: 一つのプロバイダーで失敗した場合、他のプロバイダーを試行
4. **モックデータ**: APIキーが設定されていない場合

**自動フォールバックの例:**
```
OpenRouterでPDF処理に失敗
  ↓
Anthropic APIが利用可能か確認
  ↓
Anthropic APIで再試行
  ↓
成功 または モックデータにフォールバック
```

これにより、APIキーなしでもUIをテストでき、本番環境でも安定性が保たれます。

## Supabaseのセットアップ（オプション）

データを永続化する場合は、以下の手順でSupabaseを設定してください：

### 1. Supabaseプロジェクトの作成

1. [supabase.com](https://supabase.com) でプロジェクト作成
2. Settings → API から以下を取得：
   - Project URL
   - anon/public key
3. `.env`に設定

### 2. データベーステーブルの作成

Supabase SQL Editorで以下のDDLを実行：

```sql
-- 組織テーブル
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 広報誌テーブル
CREATE TABLE newsletters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id),
  title TEXT NOT NULL,
  issue_date DATE NOT NULL,
  source_pdf_url TEXT,
  status TEXT DEFAULT 'draft',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  published_at TIMESTAMP WITH TIME ZONE
);

-- 記事テーブル
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsletter_id UUID REFERENCES newsletters(id),
  organization_id UUID REFERENCES organizations(id),

  -- 基本情報
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  deadline DATE,

  -- 4段階要約
  headline TEXT NOT NULL,
  brief TEXT NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,

  -- メタ情報
  tags TEXT[] DEFAULT '{}',
  visibility TEXT DEFAULT 'members-only',
  source TEXT,
  attachments JSONB DEFAULT '[]',

  -- 表示
  display_order INTEGER,
  is_pinned BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_articles_newsletter ON articles(newsletter_id);
CREATE INDEX idx_articles_organization ON articles(organization_id);
CREATE INDEX idx_articles_priority ON articles(priority);
```

### 3. 初期データの投入

```sql
-- テスト用組織
INSERT INTO organizations (name, subdomain)
VALUES ('テスト自治会', 'test');

-- 組織IDを確認
SELECT id, name FROM organizations;
```

## トラブルシューティング

### PDFアップロードができない

- ファイルサイズを確認（最大10MB）
- PDFファイルの形式を確認

### Claude APIエラーが発生する

1. APIキーが正しく設定されているか確認
2. APIキーの有効期限を確認
3. Anthropicアカウントの残高を確認

### 記事が抽出されない

1. PDFに日本語テキストが含まれているか確認
2. PDFが画像のみでないか確認（OCR未対応）
3. ブラウザのコンソールでエラーメッセージを確認

## 今後の拡張予定

- 記事の手動編集機能
- 記事の並び替え（ドラッグ&ドロップ）
- カテゴリのカスタマイズUI
- 会員向けページでの記事表示
- 地域向け公開ページ
- 既読管理の統合

## 参考資料

- [implementation-guide.md](./implementation-guide.md) - 詳細な設計書
- [Claude API ドキュメント](https://docs.anthropic.com/)
- [Supabase ドキュメント](https://supabase.com/docs)
