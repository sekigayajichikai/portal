# CC-SaaS（自治会 電子回覧板）

自治会の回覧板ポータル。本番稼働しているのは `apps/circulars`。回覧板の作成・記事化・
スケジュール（イベントカレンダー）抽出・地域のお知らせ配信などを行う。

## スケジュール抽出のテスト（API課金なしでHaiku検証）

PDFからのイベント抽出品質を、**Anthropic APIを叩かずに** Claude Code（定額サブスク）の
Haikuで検証できる仕組みがある。**使い方は `scripts/schedule-test/README.md` を参照**。

- PDFを `scripts/schedule-test/pdfs/<月フォルダ>/` に置く（例 `pdfs/2026-08/`）。
- Claude Code にこう頼む:
  > 「`pdfs/2026-08` フォルダの全PDFを Haikuでスケジュール抽出テストして。基準日◯◯、本日は今日、地域として。結果を表でまとめて」
- 本番の抽出は Gemini 2.5 Flash（失敗時 Claude）。`node scripts/schedule-test/run-gemini.mjs "<フォルダ>"` で本番と同じ抽出を無料枠で再現できる。
- 抽出ルールは `scripts/schedule-test/prompt.md`（本番 `eventExtractionPrompt.ts` から自動生成。直接編集しない）。

## 主要な場所
- 本番アプリ: `apps/circulars`
- 共有ロジック: `packages/shared`（イベント抽出のプロンプトは `services/ai/eventExtractionPrompt.ts`、Gemini版 `geminiService.ts`、Claude版 `claudeService.ts`、切替 `aiService.ts`）
- 抽出ルールの仕様: `docs/カレンダー抽出ルール.md`
- AIコスト方針: `docs/AIコスト・モデル方針.md`
- DBスキーマ/マイグレーション: `sql/`（本番Supabaseは iplc=sekigaya-portal。SQLはSQL Editorで手動 or MCP適用）
- 文書の索引: `docs/README.md` ／ SQLの手順: `sql/README.md` ／ 使っていない旧アプリ・旧SQL: `archive/`（`archive/README.md`）
