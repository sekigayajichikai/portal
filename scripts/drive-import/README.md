# Drive 取り込み（関ヶ谷だより・会報ふれあいの自動記事化）

Google Drive の共有フォルダ「回覧板Data」→ 年フォルダ（`2026`）→ 月フォルダ（`202611`）にある
**「関ヶ谷だより」「会報ふれあい」の PDF** を、その月の号（下書き）に PDF として登録し、記事にする。
仕様は `docs/Drive取り込み-計画.md`、Google 側の設定は `docs/Drive取り込み-Google設定手順.md`。

- 毎朝 7:00（日本時間）に GitHub Actions（`.github/workflows/drive-import.yml`）が動く
- 手動実行: GitHub の「Actions」タブ → 「Drive 取り込み」 → 「Run workflow」（月の指定・試しに見るだけ、も選べる）
- 結果は sekigaya.dx@gmail.com にメール。Actions の実行画面の「Summary」にも同じ内容が出る

## ファイル

| ファイル | 役割 |
|---|---|
| `index.mjs` | 本体。月フォルダを探す → 媒体名で PDF を選ぶ → 取込記録と突き合わせ → 号を用意 → PDF 保存 → 題名読み取り → 記事化 → 記録 |
| `drive.mjs` | Drive API をサービスアカウントで読む最小クライアント（JWT → トークン、一覧、ダウンロード） |
| `shared-entry.ts` / `build.mjs` | 本番の共有コード（記事化・保存）を esbuild で Node 用にまとめて使う。管理画面の「PDFを追加」と同じ関数 |

## 決まりごと（人が握るところ）

- 作るのは「下書きの号」と「記事」だけ。**公開・承認・削除はしない**
- 同じファイル（Drive のファイルID＋md5）は二度取り込まない（`drive_imports` に記録。`sql/migrations/2026-10-26-drive-imports.sql`）
- 取り込んだ後に Drive 側で差し替えられたら「更新あり」として知らせるだけ（記事は前の版のまま。直すかは人が決める）
- 同じ号・同じ媒体の2本目（修正版が別ファイルで置かれた等）は取り込まず知らせるだけ
- **公開済み・旧版の号には足さない**（下書きの号だけ）。下書きの号でも、同じ媒体の PDF が手で登録済みなら足さない（二重になるため）。これらは「対象外」として記録し、次回からは静かに飛ばす
- 同じ題名の号が下書きと公開版の両方にあるとき（「その場で直す」の編集中）は下書きの方に足す
- 号は月フォルダ名から決める（`202611` → 「2026年11月号」）。関ヶ谷だよりのファイル名の月（「HP2026.10月関ヶ谷だより」）は紙面の号で、フォルダの月とは1つずれることがあるが、号はフォルダの方に合わせる
- サムネイルは作らない（ブラウザの pdf.js が必要なため）。管理画面の「サムネイル生成」で後から作れる

## 手元で試す

```bash
# リポジトリ直下に .env.drive-import.local を作る（git には入らない）
#   GDRIVE_SA_KEY={"type":"service_account",...}   ← 1行の JSON
#   SUPABASE_URL=https://iplcopuwwzbtwoakqifh.supabase.co
#   SUPABASE_ANON_KEY=<service_role キー>
#   ANTHROPIC_API_KEY=sk-ant-...
DRY_RUN=1 node scripts/drive-import/index.mjs            # 何をするかを見るだけ
MONTHS=202611 DRY_RUN=1 node scripts/drive-import/index.mjs
node scripts/drive-import/index.mjs                      # 本当に取り込む
```

## 困ったとき

| こうなったら | こうする |
|---|---|
| メールに「失敗」とある | 本文の理由を読む。多いのは Claude のキー切れ・Supabase のキー違い・Drive の共有が外れた。Actions の実行ログに詳細 |
| 同じ号に PDF が二重に入った | 手でも「PDFを追加」していた場合。管理画面でどちらかを削除。自動取り込みは以後その Drive ファイルを飛ばす |
| 取り込みをやり直したい | Supabase の SQL Editor で `DELETE FROM drive_imports WHERE drive_file_id = '<ID>'` のあと、管理画面で入った PDF と記事を消してから手動実行 |
| 止めたい | GitHub の「Actions」タブ → 「Drive 取り込み」 → 右上「…」→「Disable workflow」 |
