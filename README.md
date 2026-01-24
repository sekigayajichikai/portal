<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# CC-SaaS - 自治会向け多機能Webアプリ

自治会運営を効率化するためのモノレポプロジェクトです。

View your app in AI Studio: https://ai.studio/apps/drive/1v9cidGk07_zJ_tvrPOd3ucAHe_w75x8L

## ✨ 主な機能

- **デジタル回覧板**: PDFから記事を自動抽出し、優先度別に管理
- **AIラジオ番組**: 記事から2人のDJによる掛け合い形式のラジオ番組を自動生成（3-5分）
- **イベントカレンダー**: 自治会のイベントを一元管理
- **バス時刻表**: リアルタイムの路線バス情報
- **ごみ収集日**: 地域のごみ収集スケジュール
- **AIチャット**: 自治会に関する質問に自動回答

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

## 🌐 本番環境へのデプロイ

### Vercelへのデプロイ（推奨）

このアプリをインターネット上で公開する詳細な手順は、[DEPLOYMENT.md](DEPLOYMENT.md) をご覧ください。

**概要**:
1. Supabaseで本番環境のデータベースをセットアップ
2. Vercelアカウントを作成してGitHubと連携
3. 2つのアプリ（一般ユーザー & 管理画面）をそれぞれデプロイ

**デプロイ後のURL例**:
- 一般ユーザー画面: `https://cc-saas-public.vercel.app`
- 管理画面: `https://cc-saas-admin.vercel.app`

**必要な環境変数**:
- `VITE_GEMINI_API_KEY`
- `VITE_APP_PASSWORD`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Vercelは `main` ブランチへのプッシュを自動検知し、自動的にデプロイします。

### 代替のデプロイ先

- **Netlify**: Vercelと同様の手順でデプロイ可能
- **Cloudflare Pages**: 高速なエッジ配信が可能
- **その他**: Viteアプリをホスティングできる任意のサービス

## 📻 AIラジオ番組機能

デジタル回覧板の記事から、AIが自動的にラジオ番組を生成します。

### セットアップ

1. データベースとストレージのセットアップ:
   ```bash
   # Supabase SQL Editorで実行
   radio-programs-setup.sql
   radio-storage-setup.sql
   ```

2. 詳細なセットアップ手順とテスト方法は [RADIO-FEATURE-GUIDE.md](RADIO-FEATURE-GUIDE.md) を参照

### 使い方

**管理画面（生成）:**
1. デジタル回覧板 > 保存済み一覧 > 任意の回覧板を選択
2. 「ラジオ番組を生成」ボタンをクリック
3. 約1-2分で3-5分のラジオ番組が完成

**一般ユーザーアプリ（再生）:**
1. ボトムナビゲーション > 地域放送
2. プレイリストから番組を選択して再生

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
