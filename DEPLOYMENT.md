# 🚀 デプロイ手順書

このガイドでは、CC-SaaSアプリケーションをインターネット上で公開する手順を、初心者向けに詳しく解説します。

## 📋 目次

1. [事前準備](#事前準備-必要なもの)
2. [Supabase本番環境のセットアップ](#ステップ1-supabase本番環境のセットアップ)
3. [Vercelアカウント作成とGitHub連携](#ステップ2-vercelアカウント作成とgithub連携)
4. [一般ユーザーアプリのデプロイ](#ステップ3-一般ユーザーアプリのデプロイ)
5. [管理画面アプリのデプロイ](#ステップ4-管理画面アプリのデプロイ)
6. [動作確認とテスト](#ステップ5-動作確認とテスト)
7. [トラブルシューティング](#トラブルシューティング)

---

## 事前準備: 必要なもの

### 既に持っているもの
- ✅ **GitHubアカウント**（このリポジトリがある前提）
- ✅ **Googleアカウント**（Gemini API用）

### これから作成するもの
- 🆕 **Supabaseアカウント**（無料プラン）
- 🆕 **Vercelアカウント**（無料プラン）

### 所要時間
- 初回セットアップ: 約30-45分
- 2回目以降のデプロイ: 約5分（自動デプロイ）

---

## ステップ1: Supabase本番環境のセットアップ

### 1-1. Supabaseプロジェクトの作成

1. **Supabaseにアクセス**
   - [https://supabase.com](https://supabase.com) を開く
   - 「Start your project」をクリック

2. **アカウント作成**
   - 「Continue with GitHub」を選択してサインイン
   - GitHubで認証を許可

3. **新しいプロジェクトを作成**
   - 「New project」ボタンをクリック
   - 以下の情報を入力:

     | 項目 | 設定値 | 説明 |
     |------|--------|------|
     | **Name** | `cc-saas-production` | プロジェクト名（任意） |
     | **Database Password** | 自動生成されたものをコピー | 📝 安全な場所に保存してください |
     | **Region** | `Northeast Asia (Tokyo)` | 日本から最も近いサーバー |
     | **Pricing Plan** | `Free` | 無料プラン（十分な容量） |

   - 「Create new project」をクリック
   - ⏳ **約2分待つ**（データベースが初期化されます）

### 1-2. データベーステーブルの作成

1. **SQL Editorを開く**
   - Supabaseダッシュボードの左メニューから「SQL Editor」を選択
   - 「New query」をクリック

2. **SQLスクリプトを順番に実行**

   以下のSQLファイルを **この順番で** 実行してください。各ファイルの内容をコピーして、SQL Editorにペーストし、「Run」ボタンをクリックします。

   #### ① 基本テーブルの作成

   **ファイル**: [`database-setup.sql`](database-setup.sql)

   - デジタル回覧板（newsletters）と記事（articles）のテーブルを作成します
   - 実行後、「Success. No rows returned」と表示されればOK

   #### ② ストレージの設定（開発環境用）

   **ファイル**: [`storage-setup-dev.sql`](storage-setup-dev.sql)

   - PDFファイルをアップロードするためのストレージを設定します
   - ⚠️ **注意**: これは開発環境用の設定です（認証なしでアップロード可能）
   - 本番環境では [`storage-setup-prod.sql`](storage-setup-prod.sql) の使用を推奨しますが、認証機能の実装が必要です

   #### ③ バス時刻表の設定

   **ファイル**: [`bus-schedules-setup.sql`](bus-schedules-setup.sql)

   - バス時刻表機能に必要なテーブルを作成します

   #### ④ 記事タイプの追加

   **ファイル**: [`add-article-type.sql`](add-article-type.sql)

   - 記事の分類機能を追加します

   #### ⑤ ラジオ番組機能の設定

   **ファイル**: [`radio-programs-setup.sql`](radio-programs-setup.sql)
   **ファイル**: [`radio-storage-setup.sql`](radio-storage-setup.sql)
   **ファイル**: [`radio-programs-rls-setup.sql`](radio-programs-rls-setup.sql)

   - AIラジオ番組の生成と保存に必要なテーブルとストレージを設定します
   - 3つのファイルを順番に実行してください

3. **テーブルの確認**
   - 左メニューから「Table Editor」を選択
   - 以下のテーブルが作成されていることを確認:
     - newsletters
     - articles
     - bus_schedules
     - radio_programs
     - （他にもいくつかのテーブルが表示されます）

### 1-3. Supabase接続情報の取得

1. **API設定ページを開く**
   - Supabaseダッシュボードの左メニューから「Project Settings」（歯車アイコン）をクリック
   - 「API」タブを選択

2. **必要な情報をコピー**

   以下の2つの情報を **メモ帳などに保存** してください（後でVercelの環境変数として使用します）:

   | 項目 | Supabase画面での表示名 | 環境変数名 | 形式 |
   |------|---------------------|-----------|------|
   | **プロジェクトURL** | Project URL | `VITE_SUPABASE_URL` | `https:// | **匿名キー** | anon public | `VITE_SUPABASE_ANON_KEY` | `eyJ...`で始まる長い文字列 |

   📝 **コピーのヒント**: 各項目の右側にあるコピーアイコンをクリックすると、クリップボードにコピーされます。

---

## ステップ2: Vercelアカウント作成とGitHub連携

### 2-1. Vercelアカウント作成

1. **Vercelにアクセス**
   - [https://vercel.com](https://vercel.com) を開く
   - 「Sign Up」ボタンをクリック

2. **GitHubでサインイン**
   - 「Continue with GitHub」を選択
   - GitHubの認証画面で「Authorize Vercel」をクリック
   - Vercelがリポジトリにアクセスする権限を許可します

3. **Welcome画面**
   - チュートリアルが表示される場合は「Skip」でスキップしてOK

### 2-2. GitHubリポジトリの確認

デプロイする前に、このプロジェクトが **GitHubにプッシュされている** ことを確認してください。

**確認方法**:xxxxx.supabase.co` |

- GitHubでリポジトリページを開いて、最新のコードが反映されているか確認

**まだプッシュしていない場合**:

```bash
# 変更をコミット
git add .
git commit -m "Prepare for deployment"

# GitHubにプッシュ
git push origin main
```

---

## ステップ3: 一般ユーザーアプリのデプロイ

このプロジェクトには **2つのアプリ** があります。まずは一般ユーザー向けのアプリをデプロイします。

### 3-1. 新しいプロジェクトの作成

1. **Vercelダッシュボードを開く**
   - [https://vercel.com/dashboard](https://vercel.com/dashboard) にアクセス

2. **プロジェクトをインポート**
   - 「Add New...」ボタンをクリック
   - 「Project」を選択
   - 「Import Git Repository」セクションで `CC-SaaS` リポジトリを探す
   - 「Import」ボタンをクリック

### 3-2. プロジェクト設定

**Configure Project** 画面で以下を設定します:

#### 基本設定

| 項目 | 設定値 | 説明 |
|------|--------|------|
| **Project Name** | `cc-saas-public` | 一般ユーザー用アプリの名前 |
| **Framework Preset** | `Vite` | 自動検出されるはず |

#### Root Directory（重要！）

- **Root Directory** の横にある「Edit」ボタンをクリック
- `apps/public` と入力
- ✅ これにより、Vercelは `apps/public` フォルダをデプロイ対象として認識します

#### Build and Output Settings

以下はデフォルトのままでOKです:

| 項目 | 値 |
|------|-----|
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

### 3-3. 環境変数の設定

**Environment Variables** セクションまでスクロールし、以下の4つの環境変数を追加します。

#### 環境変数の入力方法

各環境変数について:
1. **Key** の欄に変数名を入力
2. **Value** の欄に対応する値を入力
3. 「Add」ボタンをクリック

#### 必要な環境変数

| Key | Value | 取得方法 |
|-----|-------|---------|
| `VITE_GEMINI_API_KEY` | あなたのGemini APIキー | [Google AI Studio](https://ai.google.dev/) で取得 |
| `VITE_APP_PASSWORD` | 任意の強力なパスワード | アプリへのログインパスワード（例: `MySecurePass2024!`） |
| `VITE_SUPABASE_URL` | ステップ1-3で取得したURL | `https://xxxxx.supabase.co` の形式 |
| `VITE_SUPABASE_ANON_KEY` | ステップ1-3で取得したキー | `eyJ...` で始まる長い文字列 |

📝 **重要**:
- `VITE_APP_PASSWORD` は **推測されにくいパスワード** を設定してください
- これがアプリにアクセスするためのパスワードになります
- 自治会のメンバーにはこのパスワードを共有します

### 3-4. デプロイ実行

1. **Deploy ボタンをクリック**
   - すべての設定が完了したら、画面下部の「Deploy」ボタンをクリック

2. **デプロイの進行を確認**
   - デプロイログが表示されます
   - ⏳ **約2-3分待ちます**（初回は依存パッケージのインストールに時間がかかります）
   - 進行状況:
     - Building... （ビルド中）
     - Deploying... （デプロイ中）
     - ✅ Congratulations! （成功）

3. **デプロイ成功の確認**
   - 「Congratulations! 🎉」と表示されたら成功です
   - 画面に表示される **公開URL** をクリックして動作確認

**公開URL例**: `https://cc-saas-public.vercel.app`

4. **初回アクセステスト**
   - パスワード入力画面が表示されることを確認
   - `VITE_APP_PASSWORD` で設定したパスワードを入力
   - ダッシュボードが表示されればOK ✅

---

## ステップ4: 管理画面アプリのデプロイ

次に、管理画面用のアプリをデプロイします。手順はステップ3とほぼ同じですが、**Root Directory が異なる** ので注意してください。

### 4-1. 新しいプロジェクトの作成

1. **Vercelダッシュボードに戻る**
   - [https://vercel.com/dashboard](https://vercel.com/dashboard)

2. **プロジェクトをインポート**
   - 「Add New...」→「Project」をクリック
   - 再度 `CC-SaaS` リポジトリを選択
   - 「Import」ボタンをクリック

### 4-2. プロジェクト設定（管理画面用）

**Configure Project** 画面で以下を設定します:

| 項目 | 設定値 |
|------|--------|
| **Project Name** | `cc-saas-admin` |
| **Framework Preset** | `Vite` |
| **Root Directory** | `apps/admin` ⚠️ **重要: 一般ユーザーアプリと異なります** |

#### Build and Output Settings

一般ユーザーアプリと同じ設定でOK:

| 項目 | 値 |
|------|-----|
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

### 4-3. 環境変数の設定

**一般ユーザーアプリと全く同じ環境変数** を設定してください:

- `VITE_GEMINI_API_KEY`
- `VITE_APP_PASSWORD`（同じパスワードを使用）
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

💡 **時短テクニック**: 一般ユーザーアプリの環境変数をコピー＆ペーストすればOKです。

### 4-4. デプロイ実行

1. 「Deploy」ボタンをクリック
2. ⏳ 約2-3分待つ
3. ✅ 成功したら公開URLをクリックして動作確認

**公開URL例**: `https://cc-saas-admin.vercel.app`

---

## ステップ5: 動作確認とテスト

### 5-1. 一般ユーザーアプリのテスト

1. **アクセス**
   - `https://cc-saas-public.vercel.app` を開く

2. **ログイン**
   - パスワード入力画面が表示される
   - `VITE_APP_PASSWORD` で設定したパスワードを入力

3. **ダッシュボード確認**
   - ログイン成功 → ダッシュボードが表示される
   - 各タブが正常に表示されるか確認

4. **各機能のテスト**
   - ✅ デジタル回覧板: 記事が表示されるか
   - ✅ AIチャット: Gemini APIが動作するか
   - ✅ バス時刻表: バス停が選択できるか
   - ✅ イベントカレンダー: カレンダーが表示されるか
   - ✅ 地域放送: ラジオプレイリストが表示されるか

### 5-2. 管理画面アプリのテスト

1. **アクセス**
   - `https://cc-saas-admin.vercel.app` を開く

2. **ログイン**
   - パスワードでログイン

3. **管理機能のテスト**
   - ✅ PDFアップロード: 回覧板PDFがアップロードできるか
   - ✅ 記事の自動抽出: Gemini APIが記事を抽出できるか
   - ✅ AIラジオ番組生成: ラジオ番組が生成されるか
   - ✅ デジタル回覧板: 保存済み一覧が表示されるか

### 5-3. データベース連携の確認

1. **管理画面で記事を作成**
   - 管理画面からPDFをアップロードして記事を抽出

2. **一般ユーザーアプリで確認**
   - 一般ユーザーアプリの「デジタル回覧板」タブを開く
   - 作成した記事が表示されることを確認
   - ✅ データベース連携が正常に動作しています

---

## 補足: 自動デプロイの仕組み

Vercelは **GitHubと自動連携** されています。これにより、以下のような便利な機能が使えます:

### 自動デプロイ

- `main` ブランチに `git push` すると、**自動的に本番環境にデプロイされます**
- Pull Requestを作成すると、**プレビュー環境が自動作成されます**

### 例: コードを修正してデプロイする場合

```bash
# ローカルで修正
git add .
git commit -m "機能を改善"
git push origin main

# → Vercelが自動的に検知して、約2-3分で本番環境に反映
```

### デプロイ履歴の確認

1. Vercelダッシュボード → プロジェクトを選択
2. 「Deployments」タブを開く
3. デプロイの履歴が一覧表示されます
   - 各デプロイのログを確認できます
   - 問題があれば、前のバージョンにロールバックできます

---

## トラブルシューティング

### ❌ ビルドが失敗する場合

**症状**: Vercelのデプロイ時に「Build failed」と表示される

**原因**:
- 環境変数が設定されていない
- ビルドコマンドが間違っている
- Root Directoryが正しく設定されていない

**解決策**:

1. **環境変数の確認**
   - Vercelダッシュボード → プロジェクトを選択
   - 「Settings」タブ → 「Environment Variables」
   - 4つの環境変数がすべて設定されているか確認

2. **Root Directoryの確認**
   - 「Settings」タブ → 「General」
   - Root Directoryが正しいか確認:
     - 一般ユーザーアプリ: `apps/public`
     - 管理画面: `apps/admin`

3. **ビルドログの確認**
   - 「Deployments」タブ → 失敗したデプロイをクリック
   - ログを読んで、具体的なエラーメッセージを確認

4. **再デプロイ**
   - 設定を修正したら「Deployments」タブから「Redeploy」

### ❌ アプリは表示されるが、データベースに接続できない

**症状**: アプリは開くが、「データベースに接続できません」などのエラーが表示される

**原因**: Supabase接続情報が間違っている

**解決策**:

1. **Supabase接続情報の確認**
   - Supabaseダッシュボード → 「Project Settings」→「API」
   - URLとキーをコピー

2. **Vercelの環境変数を修正**
   - Vercelダッシュボード → プロジェクト → 「Settings」→「Environment Variables」
   - `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を確認・修正

3. **再デプロイ**
   - 環境変数を変更したら、必ず「Redeploy」が必要です
   - 「Deployments」タブ → 最新のデプロイの「...」→「Redeploy」

### ❌ Gemini APIが動作しない

**症状**: AIチャットやラジオ番組生成が失敗する

**原因**:
- Gemini APIキーが間違っている
- APIキーの有効期限が切れている
- APIの利用制限に達している

**解決策**:

1. **APIキーの確認**
   - [Google AI Studio](https://ai.google.dev/) にアクセス
   - 「Get API Key」→ 既存のキーを確認または新しいキーを作成

2. **Vercelの環境変数を更新**
   - `VITE_GEMINI_API_KEY` を正しいキーに更新
   - 「Redeploy」を実行

3. **APIの利用制限を確認**
   - Google AI Studioで利用状況を確認
   - 無料プランの制限に達している場合は、有料プランへのアップグレードを検討

### ❌ パスワードを忘れた

**症状**: アプリのログインパスワードがわからなくなった

**解決策**:

1. Vercelダッシュボード → プロジェクト → 「Settings」→「Environment Variables」
2. `VITE_APP_PASSWORD` の値を確認
3. パスワードを変更したい場合:
   - 新しいパスワードに更新
   - 「Save」をクリック
   - 「Deployments」タブから「Redeploy」を実行

### ❌ PDFアップロードが失敗する

**症状**: 管理画面でPDFをアップロードしようとすると失敗する

**原因**: Supabaseストレージのポリシーが正しく設定されていない

**解決策**:

1. **ストレージポリシーの確認**
   - Supabaseダッシュボード → 「Storage」
   - `newsletters` バケットが作成されているか確認

2. **ポリシーの再実行**
   - 「SQL Editor」を開く
   - [`storage-setup-dev.sql`](storage-setup-dev.sql) を再度実行

3. **ファイルサイズの確認**
   - Supabaseの無料プランでは、1ファイル最大50MBまで
   - PDFファイルのサイズを確認

### ❌ 「This site can't be reached」エラー

**症状**: Vercelのデプロイは成功したが、URLにアクセスできない

**原因**:
- デプロイ直後でDNSが伝播していない
- ブラウザのキャッシュ

**解決策**:

1. **数分待つ**
   - デプロイ直後は、DNSの伝播に数分かかる場合があります

2. **ブラウザをリロード**
   - Ctrl + F5（Windows）または Cmd + Shift + R（Mac）で強制リロード

3. **シークレットモードで試す**
   - ブラウザのシークレットモード（プライベートブラウジング）で開く

---

## まとめ

✅ **完了したこと**:

- Supabase本番環境のセットアップ
- 2つのアプリ（一般ユーザー画面 & 管理画面）のVercelデプロイ
- 環境変数の設定
- 動作確認とテスト

✅ **公開されたURL**:

- **一般ユーザー画面**: `https://cc-saas-public.vercel.app`
- **管理画面**: `https://cc-saas-admin.vercel.app`

**おめでとうございます！🎉**

これで、インターネット上で誰でも（パスワードを知っている人が）アクセスできるようになりました。

自治会のメンバーには、以下の情報を共有してください:

- 一般ユーザー画面のURL
- ログインパスワード（`VITE_APP_PASSWORD`）

---

## 次のステップ（オプション）

### 独自ドメインを設定したい場合

無料のVercel URLではなく、独自ドメイン（例: `your-app.com`）を使いたい場合:

1. **ドメインを購入**
   - お名前.com、Google Domains、Cloudflareなどで購入

2. **Vercelにドメインを追加**
   - Vercelダッシュボード → プロジェクト → 「Settings」→「Domains」
   - 購入したドメインを入力して「Add」

3. **DNSレコードを設定**
   - Vercelが表示する指示に従って、ドメインのDNSレコードを設定
   - 通常、A レコードまたは CNAME レコードを追加します

4. **数分～数時間待つ**
   - DNSの伝播には時間がかかる場合があります

### 本番環境用のストレージポリシーに変更したい場合

現在は開発環境用のポリシー（匿名ユーザーもアップロード可能）を使用しています。セキュリティを強化する場合:

1. **認証機能を実装**
   - Supabase Authを使って、ユーザー認証機能を追加

2. **本番環境用ポリシーを適用**
   - Supabase SQL Editorで [`storage-setup-prod.sql`](storage-setup-prod.sql) を実行

3. **開発環境用のポリシーを削除**
   - SQL Editorで古いポリシーを削除

詳細は [`HYBRID-MODE-GUIDE.md`](HYBRID-MODE-GUIDE.md) を参照してください。

### アクセス解析を追加したい場合

どのくらいの人がアプリを使っているか知りたい場合:

1. **Vercel Analyticsを有効化**
   - Vercelダッシュボード → プロジェクト → 「Analytics」タブ
   - 「Enable Analytics」をクリック
   - 無料プランで基本的な解析が利用できます

2. **Google Analyticsを追加**
   - より詳細な解析が必要な場合は、Google Analyticsを統合

---

## サポートとドキュメント

- **プロジェクトのREADME**: [README.md](README.md)
- **ラジオ機能の詳細**: [RADIO-FEATURE-GUIDE.md](RADIO-FEATURE-GUIDE.md)
- **ハイブリッドモード**: [HYBRID-MODE-GUIDE.md](HYBRID-MODE-GUIDE.md)
- **Vercel公式ドキュメント**: https://vercel.com/docs
- **Supabase公式ドキュメント**: https://supabase.com/docs

何か問題が発生した場合は、上記のドキュメントを参照するか、GitHubのIssueで質問してください。
