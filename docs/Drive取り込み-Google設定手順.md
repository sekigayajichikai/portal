# Drive 自動取り込みの Google 設定手順（はな向け）

`Drive取り込み-計画.md` の第1段階を動かすための、Google 側の設定。30分ほど。
画面の文言は 2026-10 時点の Google Cloud コンソール。多少変わっていても項目名で探せる。

## 1. Google Cloud のプロジェクトを作る（sekigaya.dx@gmail.com で・組織の外に）

1. https://console.cloud.google.com/ を **sekigaya.dx@gmail.com** でログインして開く（右上のアカウント写真で切り替え）
2. 上部のプロジェクト名（または「プロジェクトを選択」）→「新しいプロジェクト」
3. プロジェクト名: `sekigaya-portal-drive`。「組織」の欄は「組織なし」のまま → 「作成」
4. 作ったプロジェクトが選ばれていることを上部で確認する

> **hanainc.net のアカウント／既存の CC-SaaS プロジェクトでは作らない。** 会社の組織には「サービスアカウントの鍵を作らせない」
> 組織ポリシー（`iam.disableServiceAccountKeyCreation`）が効いていて、手順 3 の鍵の作成でブロックされる（2026-10-26 に確認）。
> 個人の Gmail アカウントのプロジェクトには組織ポリシーが無いので鍵が作れる。Gemini のキーは CC-SaaS のままでよい。

## 2. Drive API を有効にする

1. 左メニュー「API とサービス」→「ライブラリ」
2. 検索で `Google Drive API` → 開いて「有効にする」

## 3. サービスアカウントを作って鍵を下ろす

1. 左メニュー「IAM と管理」→「サービス アカウント」→「サービス アカウントを作成」
2. 名前: `portal-drive-import` → 「作成して続行」。ロールは付けなくてよい → 「完了」
3. 一覧に出たメールアドレス（`portal-drive-import@sekigaya-portal-drive.iam.gserviceaccount.com` の形）を **控える**
4. そのアカウントを開く → タブ「キー」→「鍵を追加」→「新しい鍵を作成」→ JSON → 「作成」
5. JSON ファイルがダウンロードされる。**これは合言葉と同じ扱い**。メールや LINE で送らない。GitHub の Secrets に貼ったら PC からは削除してよい

## 4. 共有フォルダをサービスアカウントに共有する

1. Google Drive で共有フォルダ（`202611` などの月フォルダが入っている親フォルダ）を右クリック →「共有」。この操作だけは、そのフォルダを開けるアカウント（sekigaya.dx@gmail.com など）で行う
2. 3 で控えたメールアドレスを入れ、権限は **閲覧者** → 「送信」（通知のチェックは外してよい）
3. フォルダを開いたときの URL `https://drive.google.com/drive/folders/XXXXXXXX` の `XXXXXXXX` を **控える**（フォルダID）

## 5. GitHub に Secrets を登録する

1. https://github.com/sekigayajichikai/portal/settings/secrets/actions を開く（リポジトリ上部の「Settings」→ 左の「Secrets and variables」→「Actions」）
2. 「New repository secret」で次を1つずつ登録する

| Name | Secret（値） |
|---|---|
| `GDRIVE_SA_KEY` | 3 で下ろした JSON の中身をそのまま全部貼る |
| `GDRIVE_ROOT_FOLDER_ID` | 4 のフォルダID |
| `ANTHROPIC_API_KEY` | Claude のキー（Supabase の `ai-proxy` に入れているものと同じでよい） |
| `SUPABASE_URL` | `https://iplcopuwwzbtwoakqifh.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase ダッシュボード → Project Settings → API → `service_role`（**anon ではない方**。公開しない） |
| `NOTIFY_GMAIL_USER` | `sekigaya.dx@gmail.com` |
| `NOTIFY_GMAIL_APP_PASSWORD` | 下の 6 で作るアプリパスワード |

## 6. 通知メール用の Gmail アプリパスワード

1. sekigaya.dx@gmail.com の Google アカウント → 「セキュリティ」→ 2段階認証プロセスを **オン** にする（まだなら）
2. https://myaccount.google.com/apppasswords → アプリ名 `portal-drive-import` → 「作成」
3. 出てきた16文字を `NOTIFY_GMAIL_APP_PASSWORD` に登録する（この画面を閉じると二度と見られない。無くしたら作り直す）

## 7. 動作確認（実装後）

1. GitHub の「Actions」タブ → 左の「Drive 取り込み」→ 右の「Run workflow」で手動実行
2. 数分後に sekigaya.dx@gmail.com にメールが届く。管理画面の回覧板タブに、その月の号（下書き）と記事ができている
3. うまくいかないときは Actions の実行ログを見るか、エラーメールの文面を Claude に貼る
