# CC-SaaS — 関ヶ谷自治会 電子回覧板

自治会の回覧板をスマホで読めるようにするポータル。本番: https://sekigayajichikai.vercel.app

## ✨ 主な機能

- **電子回覧板**: 回覧板PDFから記事をAIで抽出し、月号ごとに公開。承認フロー（担当者確認→公開）付き
- **カレンダー予定の抽出**: 記事・添付PDFからイベントを AI（Gemini 無料枠、失敗時 Claude）で読み取り、人が確認して登録
- **関ヶ谷レポート**: 写真つきの読み物記事（イベントレポート）。Markdown で書いてライブプレビュー
- **週次配信**: 公式LINE「今週のお知らせ」の文面と画像を、公開中の予定とレポートから自動生成

## 📁 プロジェクト構成

```
CC-SaaS/
├── apps/circulars/     # 本番アプリ（Vite + React）。管理画面 /admin、住民ページ /
├── packages/shared/    # 共有ロジック（AI抽出・Supabase アクセス・型）
├── supabase/functions/ # Edge Functions（ai-proxy: AIキーをサーバー側に置く / app-login）
├── sql/                # DB 定義とマイグレーション（sql/README.md）
├── docs/               # 設計メモ・ルール（docs/README.md）
├── scripts/            # 抽出テスト（schedule-test）、レポート投入（seed-report）
└── archive/            # 使っていない旧アプリ・旧SQL（archive/README.md）
```

## 🚀 ローカル環境でのセットアップ

**必要な環境:** Node.js 18以上

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

#### 🔄 環境別設定ファイル（推奨）

開発環境と本番環境でSupabaseを使い分けるため、**環境別の設定ファイル**を使用することを強く推奨します。

**ファイル構成:**

```
CC-SaaS/
├── .env.development.local  # 開発環境用（Gitにコミットされない）
└── .env.production.local   # 本番ビルドテスト用（参考、Gitにコミットされない）
```

**設定方法:**

1. **`.env.development.local`を作成**（開発環境用）

プロジェクトルートに以下の内容で`.env.development.local`ファイルを作成してください：

```bash
# 開発環境用Supabase設定
VITE_SUPABASE_URL=https://your-dev-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-dev-anon-key

# その他の環境変数
VITE_GEMINI_API_KEY=your-gemini-api-key
VITE_APP_PASSWORD=dev123  # 開発用パスワード
```

2. **`.env.production.local`を作成**（オプション、ローカルで本番ビルドをテストする場合）

```bash
# 本番環境用Supabase設定（参考用）
# Vercelデプロイ時はVercelの環境変数が優先されます
VITE_SUPABASE_URL=https://your-prod-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-prod-anon-key

VITE_GEMINI_API_KEY=your-gemini-api-key
VITE_APP_PASSWORD=your-production-password
```

**自動切り替えの仕組み:**

- `npm run dev` → 自動的に`.env.development.local`を読み込み、開発用Supabaseに接続
- `npm run build` → 自動的に`.env.production.local`を読み込み、本番用設定でビルド
- Vercelデプロイ時 → Vercelの環境変数が優先され、本番用Supabaseに接続

**メリット:**

- ✅ 開発中に誤って本番データを変更するリスクがゼロ
- ✅ 環境の切り替えが自動で行われる（手動変更不要）
- ✅ `.local`ファイルは自動的にGit管理外（機密情報が漏洩しない）
- ✅ チーム開発時も各メンバーが独自の設定を持てる

#### 📝 従来の方法（シンプルだが非推奨）

環境別ファイルを使わない場合は、`.env.example` をコピーして `.env` ファイルを作成してください。

```bash
cp .env.example .env
```

⚠️ **注意**: この方法では開発用と本番用の設定を手動で切り替える必要があります。

#### 必須の環境変数

| 環境変数名            | 説明              | 取得方法                                                   |
| --------------------- | ----------------- | ---------------------------------------------------------- |
| `VITE_GEMINI_API_KEY` | Gemini AI APIキー | [Google AI Studio](https://ai.google.dev/) でAPIキーを作成 |
| `VITE_APP_PASSWORD`   | アプリアクセス用の共通パスワード | 任意の強力なパスワードを設定 |

#### オプションの環境変数

以下の環境変数は、対応する機能を利用する場合に設定してください。

| 環境変数名                    | 説明                        | 取得方法                                                                                        |
| ----------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`           | Supabase プロジェクトURL    | [Supabase Dashboard](https://supabase.com/dashboard) > Project Settings > API                   |
| `VITE_SUPABASE_ANON_KEY`      | Supabase 匿名キー           | [Supabase Dashboard](https://supabase.com/dashboard) > Project Settings > API                   |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe 公開可能キー         | [Stripe Dashboard](https://dashboard.stripe.com/apikeys) > API keys                             |
| `STRIPE_SECRET_KEY`           | Stripe シークレットキー     | [Stripe Dashboard](https://dashboard.stripe.com/apikeys) > API keys（サーバーサイドのみ）       |
| `SUPABASE_SERVICE_ROLE_KEY`   | Supabase サービスロールキー | [Supabase Dashboard](https://supabase.com/dashboard) > Project Settings > API（管理者操作のみ） |

#### 環境変数の検証

設定した環境変数が正しいか確認できます：

```bash
npm run check-env
```

このコマンドは、必須の環境変数が設定されているか、値が正しい形式かをチェックします。

#### セキュリティ上の注意

- **VITE\_** プレフィックスが付いた環境変数は、クライアント（ブラウザ）で使用されます
- プレフィックスなしの環境変数は、サーバーサイドまたはビルド時のみ使用されます
- `STRIPE_SECRET_KEY` と `SUPABASE_SERVICE_ROLE_KEY` は絶対にクライアントコードで使用しないでください
- 本番環境では、Stripeのテストキー（`pk_test_`, `sk_test_`）をライブキー（`pk_live_`, `sk_live_`）に置き換えてください
- `VITE_APP_PASSWORD` は推測されにくい強力なパスワードを設定してください（本番環境では特に重要）

### 3. 認証とアクセス制御

このアプリケーションは、パスワード認証により保護されています。アプリにアクセスするには、環境変数 `VITE_APP_PASSWORD` で設定したパスワードが必要です。

**認証の仕組み:**
- アプリにアクセスすると、パスワード入力画面が表示されます
- 正しいパスワードを入力すると、ログイン状態が `localStorage` に保存されます
- ブラウザを閉じても、ログイン状態は維持されます
- ログアウトすると、再度パスワードが必要になります

**セキュリティのベストプラクティス:**
- 本番環境では、必ず HTTPS でアプリをデプロイしてください
- パスワードは定期的に変更することをお勧めします
- パスワードは他人と共有しないでください
- URLを知っている人のみがアクセスできるため、URLの取り扱いにも注意してください

### 4. アプリケーションの起動

```bash
npm run dev
```
- 住民ページ: http://localhost:5173/
- 管理画面: http://localhost:5173/admin（パスワードは `VITE_APP_PASSWORD`）
- レポート編集: /admin?mode=reports、週次配信: /admin?mode=weekly

## 🛠️ 開発ツール

### 環境変数チェック

```bash
# 環境変数が正しく設定されているか確認
npm run check-env
```

### コード品質チェック

```bash
# ESLintでコードをチェック
npm run lint

# ESLintで自動修正可能なエラーを修正
npm run lint:fix
```

### コードフォーマット

```bash
# Prettierでコードをフォーマット
npm run format

# フォーマットをチェックのみ（修正しない）
npm run format:check
```

### ビルド

```bash
npm run build   # apps/circulars/dist に出力
```

## 🌐 本番環境へのデプロイ

GitHub の `main` に push すると Vercel が自動デプロイする。ビルド設定はルートの `vercel.json`
（`apps/circulars` をビルドして配信）。環境変数（Supabase の URL / anon key、パスワード等）は Vercel 側に設定する。
AI の API キーはクライアントに置かず、Supabase Edge Function `ai-proxy` のシークレット（`GEMINI_API_KEY` / `ANTHROPIC_API_KEY`）に置く。

- 本番: https://sekigayajichikai.vercel.app
- DB: Supabase プロジェクト iplc（sekigaya-portal）。SQL は `sql/README.md` の手順で手動適用
- 初期の3アプリ構成のデプロイ手順は `docs/archive/DEPLOYMENT.md`（現在は使わない）

## 📄 AI記事抽出のプロンプト方針

PDFからの記事自動抽出では、以下の方針でAIプロンプトを設計しています。

- **本文（content）**: PDFの原文を一言一句そのまま転記する。書き換え・要約・省略・補足は一切しない
- **タイトル・見出し（title, headline）**: AIが記事の区切りを判断し、適切に切り出す
- **要約（brief, summary）**: AIが簡潔に生成する（本文とは別フィールド）

対象プロンプトの所在: 記事抽出は `packages/shared/services/ai/claudeService.ts`、カレンダー予定の抽出は `eventExtractionPrompt.ts`（ルールは `docs/カレンダー抽出ルール.md`）

## 📻 ラジオ回覧板機能（休止中）

記事から2人のDJの掛け合い音声を生成する機能。旧管理画面（archive/apps/admin）向けで、現在の電子回覧板アプリからは使っていない。
手順は docs/archive/RADIO-FEATURE-GUIDE.md、SQL は archive/sql/features/ を参照。

## 📝 開発ルール

- **コードスタイル**: ESLint + Prettierで自動フォーマット
- **命名規則**: lowerCamelCase（変数・関数）、PascalCase（コンポーネント・型）
- **コメント**: すべての関数とコンポーネントに日本語のJSDoc/docstringを記載
- **コミット前**: 必ず `npm run lint` と `npm run format` を実行

## 🔧 推奨VSCode拡張機能

プロジェクトを開くと、以下の拡張機能のインストールが推奨されます：

- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript Vue Plugin (Volar)
