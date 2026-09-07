# AIコスト・モデル方針

回覧板の記事／PDF抽出に使うLLMの選定とコスト方針のメモ。

## 現状（2026-09-06）
- 抽出は Claude を使用。モデル定数は `packages/shared/services/ai/claudeService.ts` の `CLAUDE_MODEL`。
- **採用: Claude Haiku 4.5（`claude-haiku-4-5`）**。コスト削減のため Sonnet 4.6 から切替。
- 抽出結果は人が確認ダイアログで承認するため、多少モデルが弱くても実害は小さい。

## 料金比較（1Mトークンあたり, 2026-09時点）
| モデル | 入力 | 出力 | PDF対応 | 備考 |
|---|---|---|---|---|
| Sonnet 4.6（旧） | $3 | $15 | ネイティブ | オーバースペック気味 |
| **Haiku 4.5（現行）** | $1 | $5 | ネイティブ | 定数1行で切替可 |
| Gemini 2.5 Flash | $0.30 | $2.50 | ネイティブ | 無料枠あり・キー既存 |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | ネイティブ | 品質は要検証 |

この業務は月1回・月数ドル未満なので、絶対額は小さい。最大のコストドライバーは
「1回の抽出で全PDF(10〜23枚)を毎回再送」すること（テスト時の浪費含む）。

## B案（将来検討）: PDF/イベント抽出を Gemini 2.5 Flash に移植
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
