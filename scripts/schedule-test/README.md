# スケジュール抽出テスト（API課金なし）

本番のイベント抽出は **Gemini Flash**（既定 gemini-3.6-flash・無料枠プロジェクトのキー）で、失敗時は Claude にフォールバックする
（`docs/AIコスト・モデル方針.md`）。テストは次の2通りで、どちらも**費用ゼロ**:

1. **Gemini で本番と同じリクエストを流す**（推奨・本番そのもの）
   ```
   node scripts/schedule-test/run-gemini.mjs "<pdfsフォルダ名>"
   ```
   本番コード（`eventExtractionPrompt.ts`）からプロンプトを生成して Gemini 無料枠で実行し、`results/prod-gemini-3.6-flash.json` に保存する。
   無料枠は**モデルごとに 1分5回・1日20回**なので、13秒間隔で順次実行し 429/503 は待って再試行する。
   1日の上限に当たったら別モデル名（`... prod gemini-3.8-flash`）で続けられる。
2. **Claude Code のサブエージェント（Haiku/Sonnet）で読ませる**（Claude 側の比較用）

## 👉 いちばん短い頼み方（これをClaude Codeに言うだけ）
> **「`pdfs/2026-09` フォルダを run-gemini.mjs で抽出して、結果を表でまとめて」**
> **「`pdfs/2026-09` フォルダの全PDFを Sonnetでスケジュール抽出テストして。基準日 2026-08-29、本日は今日、種別はファイル名で。結果を表でまとめて」**

- PDFは自分で `scripts/schedule-test/pdfs/<月フォルダ>/` に置く。
- 指定するのは【フォルダ名・基準日(発行日)・本日・種別(地域/自治会)】の4つ。
- `prompt.md` は本番コードから自動生成される（`node scripts/schedule-test/build-prompt.mjs`）。**直接編集しない**。
  プロンプトを変えるときは `packages/shared/services/ai/eventExtractionPrompt.ts` を直してから再生成する。
- 過去バージョン（`prompt-v2.md` / `prompt-v3.md`）は比較用の履歴。`run-gemini.mjs "<フォルダ>" prompt-v3.md` で使える。

## トークン数・費用の実測（無料）
```
node scripts/schedule-test/count-tokens.mjs "<pdfsフォルダ名>" prompt.md results/<結果>.json
```
Anthropic の count_tokens API（無料）で、本番と同じ形式（PDF + プロンプト）の入力トークン数と Haiku 単価の概算を出す。
Gemini 側のトークン数は `run-gemini.mjs` の出力（usageMetadata）に含まれる。
目安（8本18ページ）: Claude は1ページ約1,600 tokens、Gemini は1ページ258 tokens 固定。

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
- プロンプト・出力型・解析（Claude/Gemini 共通）: `packages/shared/services/ai/eventExtractionPrompt.ts`
- Gemini 版: `geminiService.ts`（`extractEventCandidatesFromPDFWithGemini` / `extractEventCandidatesWithGemini`、`GEMINI_EVENT_MODEL`＝既定 gemini-3.6-flash、`VITE_GEMINI_EVENT_MODEL` で切替）
- Claude 版（フォールバック）: `claudeService.ts`（`...WithClaude`、`CLAUDE_MODEL`）
- 切替: `aiService.ts` の `extractEventCandidates` / `extractEventCandidatesFromPDF`（`VITE_EVENT_AI_PROVIDER`）
- ルール詳細: `docs/カレンダー抽出ルール.md`

## 検証結果の履歴（2026-09-07, フォルダ `202609_01 - コピー` 8本18ページ）
| 版 | モデル | 件数 | 主な所見 |
|---|---|---|---|
| v1 | Haiku 4.5 | 27 | デイサービス内部行事6件混入、縦書き誤読、名称の合成（ジャンケンポン歌う会） |
| v2 | Haiku 4.5 | 21 | 内部行事は除外できたが介護者つどいも消えた |
| v3 | Haiku 4.5 | 19 | 漏れ3件、誤読残る |
| v3 | Sonnet 5 | 22 | 全件正解（誤字1字） |
| v3 | Gemini 2.5 Flash | 24 | 読み取りは Sonnet 同等。啓発期間を2件誤検出 |
| v4 | Gemini 2.5 Flash | 22 | 誤検出なし。kind/weekly_topic 付き（有料枠キーのみ利用可） |
| **v4（本番）** | **Gemini 3.6 Flash** | **22** | 無料枠キーで検証。2.5 と同じ内容。3.8-flash は 503 多発・日次上限で未完 |
| v5（本番） | Gemini 3.6 Flash | 22 | 申込締切・先着順を属性として抽出（にしかぜ・センターだよりで確認） |

## 注意
- `pdfs/` は一時作業用。コミット不要（住民のお知らせPDFが含まれるため）。
- prompt.md を本番プロンプト変更に合わせて更新すると、テストと本番のズレを防げる。
