# スケジュール抽出テスト（API課金なし）

本番アプリの抽出は Anthropic API（従量課金）を叩くが、**テストは Claude Code（定額サブスク）側の
Haikuサブエージェント**で行い、課金ゼロで抽出品質を確認する。本番と同じ Haiku 4.5・同じルールで検証できる。

## 👉 いちばん短い頼み方（これをClaude Codeに言うだけ）
> **「`pdfs/2026-08` フォルダの全PDFを Haikuでスケジュール抽出テストして。基準日 2026-08-29、本日は今日、地域として。結果を表でまとめて」**

- PDFは自分で `scripts/schedule-test/pdfs/<月フォルダ>/` に置く。
- 指定するのは【フォルダ名・基準日(発行日)・本日・種別(地域/自治会)】の4つ。
- Claude Code が各PDFを Read して `prompt.md` のルールで抽出。**Anthropic APIの課金は発生しない**。

## フォルダ運用（月別）

PDFは **月別フォルダ**に手動で置く: `scripts/schedule-test/pdfs/<フォルダ名>/`
例: `pdfs/2026-08/`, `pdfs/2026-09/` …

各フォルダに `manifest.json`（発行日・本日・各PDFの発行元/種別）があると精度が上がる。無くても検証は可能。

## 手順

### 1. PDFをフォルダに置く（自分で）
`pdfs/2026-08/` に検証したいPDFを入れる。

### 2. 一覧化（任意・manifest雛形も作る）
```
node scripts/schedule-test/list-folder.mjs 2026-08
```
- フォルダ内の *.pdf を列挙し、`manifest.json` の雛形を作る。
- `issue_date`（発行日）・`isJichikai`（自治会関連か）を必要なら手で埋める。

### 3. Claude Code に「フォルダごと」抽出させる（Haiku指定）
Claude Code のチャットでこう頼む:

> **`pdfs/2026-08` フォルダの全PDFを Haikuでスケジュール抽出テストして。基準日 2026-08-29、本日は今日、種別はファイル名/manifestで判断して。結果を1つの表にまとめて。**

- Claude Code が各PDFを `Read` し、`prompt.md` のルールで抽出。**API課金なし**（サブスク推論）。
- フォルダ内を順に処理し、**まとめて結果**を返す。
- モデルは「Haikuで」と明示（「Sonnetでも比較して」も可。どちらも無課金）。

### （参考）本番DBから地域PDFを自動取得したい場合
```
node scripts/schedule-test/fetch-pdfs.mjs "2026年8月号"
```
- 本番の該当号から attachment(地域)PDFだけ落とす（自治会=記事化済みは除外）。読み取りのみ・課金なし。

### 3. 結果を本番の期待と突き合わせる
- 過去日が混ざっていないか（本日より前は出ないはず）
- 募集・締切が地域PDFから出ていないか（自治会以外は開催日のみ）
- 連続イベント(①②/教室/サロン)に category:"recurring" が付くか
- にしかぜ等の9月イベントが漏れなく出るか

## プロンプト違いを比較する（Excel/CSV出力）

同じPDF群を**別々のプロンプトで抽出→結果を比較**したいとき:

1. プロンプトを変えて抽出させる（例: 現行の `prompt.md` と、調整版）。
2. 各抽出結果を `scripts/schedule-test/results/<プロンプト名>.json` として保存してもらう。
   - Claude Code に「結果を results/v1-baseline.json に保存して」等と頼めばこの形式で書き出す。
   - 形式: `{ "promptLabel": "v1", "folder": "2026-08", "results": [ { "file": "15.pdf", "label": "にしかぜ", "events": [ ... ] } ] }`
3. CSV化:
   ```
   node scripts/schedule-test/to-csv.mjs
   ```
   → `results/compare.csv`（Excelで開ける・BOM付きUTF-8）。**promptLabel 列**でプロンプト版を区別でき、
   Excelのフィルタ/ピボットで「どのプロンプトで何が増減したか」を比較できる。

依頼例:
> 「`pdfs/2026-08` を Haikuで抽出して、結果を results/A.json に保存。
>  次に prompt.md の連続判定を強めた版で同じフォルダを抽出して results/B.json に保存。最後に to-csv.mjs でCSVにして。」

## 本番との対応
- 本番ロジック: `packages/shared/services/ai/claudeService.ts`
  （`extractEventCandidatesFromPDF` / `extractEventCandidates`）
- 本番モデル: `CLAUDE_MODEL = 'claude-haiku-4-5'`
- ルール詳細: `docs/カレンダー抽出ルール.md`

## 注意
- `pdfs/` は一時作業用。コミット不要（住民のお知らせPDFが含まれるため）。
- prompt.md を本番プロンプト変更に合わせて更新すると、テストと本番のズレを防げる。
