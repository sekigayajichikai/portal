<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# CC-SaaS - 自治会向け多機能Webアプリ

自治会運営を効率化するためのモノレポプロジェクトです。

View your app in AI Studio: https://ai.studio/apps/drive/1v9cidGk07_zJ_tvrPOd3ucAHe_w75x8L

## 📁 プロジェクト構成

```
CC-SaaS/
├── apps/
│   ├── admin/          # 管理者用アプリケーション
│   └── public/         # 一般ユーザー向けアプリケーション
└── packages/
    └── shared/         # 共有ライブラリ（型定義、サービスなど）
```

## 🚀 ローカル環境でのセットアップ

**必要な環境:** Node.js 18以上

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env` ファイルを作成し、必要なAPI keyを設定してください。

```bash
cp .env.example .env
```

#### 必須の環境変数

| 環境変数名            | 説明              | 取得方法                                                   |
| --------------------- | ----------------- | ---------------------------------------------------------- |
| `VITE_GEMINI_API_KEY` | Gemini AI APIキー | [Google AI Studio](https://ai.google.dev/) でAPIキーを作成 |

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

### 3. アプリケーションの起動

```bash
# 両方のアプリを同時に起動
npm run dev

# 管理者アプリのみ起動
npm run dev:admin

# 一般ユーザーアプリのみ起動
npm run dev:public
```

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
# 両方のアプリをビルド
npm run build

# 管理者アプリのみビルド
npm run build:admin

# 一般ユーザーアプリのみビルド
npm run build:public
```

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
