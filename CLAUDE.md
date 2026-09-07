# CC-SaaS（自治会 電子回覧板）

自治会の回覧板ポータル。本番稼働しているのは `apps/circulars`。回覧板の作成・記事化・
スケジュール（イベントカレンダー）抽出・地域のお知らせ配信などを行う。

## スケジュール抽出のテスト（API課金なしでHaiku検証）

PDFからのイベント抽出品質を、**Anthropic APIを叩かずに** Claude Code（定額サブスク）の
Haikuで検証できる仕組みがある。**使い方は `scripts/schedule-test/README.md` を参照**。

- PDFを `scripts/schedule-test/pdfs/<月フォルダ>/` に置く（例 `pdfs/2026-08/`）。
- Claude Code にこう頼む:
  > 「`pdfs/2026-08` フォルダの全PDFを Haikuでスケジュール抽出テストして。基準日◯◯、本日は今日、地域として。結果を表でまとめて」
- 抽出ルールは `scripts/schedule-test/prompt.md`（本番 `claudeService.ts` と同等）。

## 主要な場所
- 本番アプリ: `apps/circulars`
- 共有ロジック: `packages/shared`（AI抽出は `services/ai/claudeService.ts`、抽出モデルは `CLAUDE_MODEL`）
- 抽出ルールの仕様: `docs/カレンダー抽出ルール.md`
- AIコスト方針: `docs/AIコスト・モデル方針.md`
- DBスキーマ/マイグレーション: `sql/`（本番Supabaseは iplc=sekigaya-portal。SQLはSQL Editorで手動 or MCP適用）
