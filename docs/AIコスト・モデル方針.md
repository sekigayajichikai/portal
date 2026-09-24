# AIコスト・モデル方針

回覧板の記事／PDF抽出に使うLLMの選定とコスト方針のメモ。

## 現状（2026-09-07）
- **カレンダー予定（イベント候補）抽出: Gemini Flash（既定 gemini-3.6-flash、無料枠プロジェクトのキー）**（B案を実施。`geminiService.ts` の `GEMINI_EVENT_MODEL`）。
  失敗時は Claude（`CLAUDE_MODEL`）にフォールバック。切替は `VITE_EVENT_AI_PROVIDER`（既定 gemini）。
- **週次配信の一押しの紹介文生成（2026-09-24）も同じ Gemini**（`generateEventDescriptionWithGemini`、無料枠。チラシPDF 1ページ ≈ 258 tokens ＋ 短い出力）。人がボタンを押したときだけ呼ぶので月に数回〜十数回。フォールバックは無し（失敗したら手入力）。
- 記事化（PDF→記事）・メタデータ抽出などは引き続き Claude。モデル定数は `claudeService.ts` の `CLAUDE_MODEL`（Haiku 4.5）。
- 抽出結果は人が確認ダイアログで承認するため、多少モデルが弱くても実害は小さい。

### 2026-09-07 の検証結果（8本18ページ、`scripts/schedule-test/results/`）
| モデル | 件数/正解22 | 1回の費用（実測） | 所見 |
|---|---|---|---|
| Haiku 4.5 | 19〜27（漏れ・誤読あり） | ¥8 | 縦書きスキャンを毎回部分誤読。名称の言い換え・合成 |
| Sonnet 5 | 22 | ¥16 | 全件正解 |
| Gemini 2.5 Flash | 22（v4） | ¥7.6（思考込み）／無料枠 ¥0 | 読み取りは Sonnet 同等。判断はやや甘いので除外ルールを明示して対処 |

### 無料枠で運用する場合の制約（2026-09-07 実測）
- 無料枠の新規プロジェクトでは **gemini-2.5-flash は提供終了（404）**。既定モデルを **gemini-3.6-flash** に変更（検証済み。`VITE_GEMINI_EVENT_MODEL` で切替可。gemini-3.8-flash は高負荷の 503 が多く、3.5-flash-lite も可）。
- 無料枠の上限は **モデルごとに 1分5リクエスト・1日20リクエスト**（Flash 系）。月1回の号（PDF 10〜20枚）なら1日で収まるが、同じ日にテストを重ねると枯渇する。テストは別モデル名か有料枠のキーで行う。
- 高負荷時の 503 が頻発する。本番ダイアログ・テストスクリプトとも 13秒間隔＋429/503 の再試行（最大3回）で対処。
- 有料換算の単価: 3.6〜3.8-flash は入力 $0.75 / 出力 $3.75（2026年末まで）。2.5-flash の約2.5倍で、1回 ¥15〜20 程度。
- Google 側で PDF は 1ページ 258 tokens（2.5）/ 532 tokens（3.x）とカウントされる。

Claude は PDF 1ページ ≈ 1,600 tokens、Gemini は 258 tokens 固定。Gemini は思考トークンが出力の4倍ほど付くため
有料換算では Haiku と同程度だが、無料枠の範囲では ¥0。

## 料金比較（1Mトークンあたり, 2026-09時点）
| モデル | 入力 | 出力 | PDF対応 | 備考 |
|---|---|---|---|---|
| Sonnet 4.6（旧） | $3 | $15 | ネイティブ | オーバースペック気味 |
| **Haiku 4.5（現行）** | $1 | $5 | ネイティブ | 定数1行で切替可 |
| Gemini 2.5 Flash | $0.30 | $2.50 | ネイティブ | 無料枠あり・キー既存 |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | ネイティブ | 品質は要検証 |

この業務は月1回・月数ドル未満なので、絶対額は小さい。最大のコストドライバーは
「1回の抽出で全PDF(10〜23枚)を毎回再送」すること（テスト時の浪費含む）。

## B案（**実施済み 2026-09-07**）: PDF/イベント抽出を Gemini 2.5 Flash に移植
実装: プロンプト・解析を `eventExtractionPrompt.ts` に共通化して二重管理を回避。Gemini 版は `geminiService.ts`、
切替とフォールバックは `aiService.ts`。無料枠の RPM 制限に合わせ、抽出ダイアログは PDF を1枚ずつ順次処理。
本番（ブラウザ）は ai-proxy 経由で呼ぶため、Edge Function のシークレット `GEMINI_API_KEY` が必要。
以下は着手前のメモ。
- **狙い**: Sonnet比 約1/10、無料枠ならこの規模は実質$0。
- **前提が揃っている**: `VITE_GEMINI_API_KEY` は設定済み。`services/ai/geminiService.ts` は既に
  `@google/genai` の `gemini-2.5-flash` を利用中（現状はPDFイベント抽出には未使用）。GeminiはPDFネイティブ対応。
- **やること**:
  1. `geminiService` に PDF/記事からのイベント抽出関数を追加（Claude版 `extractEventCandidates` /
     `extractEventCandidatesFromPDF` と同等の出力：title/event_date/event_time/event_location/organizer/category/has_details）。
     Geminiの構造化出力（`responseSchema` / `Type`）を使うとJSONが安定する。
  2. 今作り込んだプロンプトのルールを移植: 過去除外(今日基準)・募集/締切は自治会関連のみ・
     主催団体の登録名寄せ・種別(reserve/recurring/open)・連続イベントの1件集約。
  3. `aiService` かダイアログ側で、抽出プロバイダを切替可能に（環境変数 `VITE_AI_PROVIDER` を活用）。
  4. PDFは1枚ずつ inline base64 で渡し、**順次処理**（無料枠のRPM制限対策。23枚同時は避ける）。
- **デメリット**: 抽出パスが Claude と Gemini の2系統になり保守コスト増。プロンプト/出力形式の二重管理。
- **判断**: 月数ドルの節約のために2系統保守は割に合いにくい。ボリュームが大きく増える／
  クレジット運用が負担、という状況になったら着手する。

## C案（どのモデルでも効く・推奨継続）
- **未処理PDFだけ抽出**（毎回全PDFを再送しない）。テスト時のトークン浪費＝残高枯渇の主因を止める。
