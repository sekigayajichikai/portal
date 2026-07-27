# セキュリティ移行手順（AIキーのサーバーサイド化）

> 作成: 2026-07-07
> 対象: APIキーのクライアント露出解消 + パスワード認証のサーバーサイド化

## 背景

これまで Gemini / Claude / OpenRouter の APIキーと アプリパスワードが
ビルド時にJavaScriptバンドルへ埋め込まれており、公開中のアプリから
誰でも抽出できる状態でした。

コード側の対応は完了しています:

- AI呼び出しは Supabase Edge Function **`ai-proxy`** 経由（キーはサーバー側のみ）
- パスワード照合は Edge Function **`app-login`** 経由（成功時にトークン発行）
- `vite.config.ts`（3アプリ共通）からシークレットの `define` 注入を削除
- 開発時（`npm run dev`）は従来どおり `.env.development.local` の
  `VITE_*` キーで直接AIを呼び出せます（プロキシ不要）

**この手順を完了するまで、今回の変更を main にプッシュしないでください**
（プッシュするとVercelが自動デプロイし、Edge Functions 未設定のため本番のAI機能が止まります）。

## 手順

### 1. Edge Functions のデプロイ

リポジトリの `supabase/functions/` に2つの関数があります。

Supabase CLI の場合（プロジェクトルートで）:

```bash
npx supabase login
npx supabase link --project-ref ktxofualnuisijissvif
npx supabase functions deploy app-login
npx supabase functions deploy ai-proxy
```

（Claude Code に「Edge Functionsをデプロイして」と指示すれば、承認ダイアログ付きで実行できます）

### 2. シークレットの設定

**先に新しいAPIキーを発行してください（手順3参照）。** その後:

```bash
npx supabase secrets set APP_PASSWORD="<アプリの共有パスワード>"
npx supabase secrets set APP_TOKEN_SECRET="<ランダムな長い文字列>"
npx supabase secrets set ANTHROPIC_API_KEY="<新しいClaudeキー>"
npx supabase secrets set OPENROUTER_API_KEY="<新しいOpenRouterキー>"   # 使う場合のみ
npx supabase secrets set GEMINI_API_KEY="<新しいGeminiキー>"           # ラジオ用・将来分
```

`APP_TOKEN_SECRET` の生成例: `openssl rand -hex 32`（PowerShellなら
`-join ((1..64) | %{ '{0:x}' -f (Get-Random -Max 16) })`）

ダッシュボードからの場合: Supabase Dashboard → Edge Functions → Secrets

### 3. 露出済みキーのローテーション（必須）

現在のキーは公開バンドルから抽出可能だったため、**すべて失効させて再発行**してください:

| キー | 再発行場所 |
|---|---|
| Gemini | https://aistudio.google.com/apikey → 旧キー削除 → 新規作成 |
| Anthropic (Claude) | https://console.anthropic.com/settings/keys → 旧キー無効化 → 新規作成 |
| OpenRouter | https://openrouter.ai/keys → 同上 |

新キーは **Supabase secrets のみ**に設定します（`.env.development.local` には
開発用に置いてOK。Gitにはコミットされません）。

### 4. Vercel 環境変数の整理

Vercel Dashboard → cc-saas（circulars）プロジェクト → Settings → Environment Variables:

**削除するもの（バンドル混入の原因）:**
- `VITE_ANTHROPIC_API_KEY`
- `VITE_OPENROUTER_API_KEY`
- `VITE_GEMINI_API_KEY`
- `VITE_APP_PASSWORD`

**残すもの:**
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`（anonキーは公開前提）
- `VITE_AI_PROVIDER` / `VITE_OPENROUTER_MODEL`（非シークレット）

### 5. デプロイと動作確認

1. 変更を main にプッシュ → Vercel が自動デプロイ
2. アプリを開き、パスワードでログイン（内部で app-login が動く）
3. 管理画面でPDFを1つアップロードして記事抽出が動くことを確認（内部で ai-proxy が動く）
4. ブラウザの開発者ツール → Sources でバンドルを検索し、
   `sk-ant` / `AIzaSy` などが**含まれない**ことを確認

### 6. Google Apps Script（Drive同期）の設定移行

`scripts/google-drive-sync.js` はハードコードをやめ、スクリプト プロパティから
読むように変更済みです。GAS側で:

1. https://script.google.com → 対象プロジェクト → プロジェクトの設定
2. スクリプト プロパティに `DRIVE_FOLDER_ID` / `SUPABASE_URL` / `SUPABASE_ANON_KEY` を追加
3. コードを新しい `scripts/google-drive-sync.js` の内容で置き換え

## 補足: 認証の仕組み

```
[ブラウザ] --パスワード--> [app-login] --照合--> APP_PASSWORD (secret)
    <--トークン(HMAC)--
[ブラウザ] --AIリクエスト + x-app-token--> [ai-proxy] --検証--> APP_TOKEN_SECRET
                                              --転送(キー付与)--> Anthropic / OpenRouter / Gemini
```

- トークンは localStorage `cc-saas-auth-token` に保存
- パスワード変更時は `APP_PASSWORD` を更新（既存トークンは `APP_TOKEN_SECRET` を
  変えない限り有効なまま。全員を強制ログアウトしたい場合は `APP_TOKEN_SECRET` も変更）

## 残課題（中期）

- 共有パスワード方式そのものの限界（利用者個別の無効化不可）→ Supabase Auth への移行
- 本文テーブル・ストレージの RLS 強化（現在 anon で広く読み書き可能）
