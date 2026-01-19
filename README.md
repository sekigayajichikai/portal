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

Gemini API Keyは [Google AI Studio](https://ai.google.dev/) で取得できます。

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
