# TODO - CC-SaaS (まちポータル)

> 最終更新: 2026-07-28(セキュリティ改修の本番反映を反映)
> 実運用中の機能: デジタル回覧板作成 / スケジュール関連(LINE名簿は本リポジトリ外)

---

## 🚨 緊急(セキュリティ)

### 露出済みAPIキーのローテーション【残作業】
旧キーは公開バンドルから抽出可能だったため、再発行または削除が必要。
- [ ] Anthropic: [console.anthropic.com](https://console.anthropic.com) で新キー発行 → `npx supabase secrets set ANTHROPIC_API_KEY=...` で再設定 → `.env.development.local` も更新 → 旧キー失効
- [ ] Gemini: ラジオ生成機能(台本+音声)でのみ使用。使い続けるなら Google AI Studio で再発行して同様に再設定、使わないなら旧キーの削除だけでもよい
- [ ] OpenRouter: 現在未使用なら旧キーの失効のみ

### AI APIキーのクライアント露出 → 対応済み(2026-07-27)
- [x] AI呼び出しを Supabase Edge Function(`ai-proxy`)経由に移行(デプロイ・シークレット設定・E2E確認済み)
- [x] vite.config の define からシークレット注入を削除。本番バンドルにキー混入なしを検査済み

### パスワード認証が実質無効 → 短期対応済み(2026-07-27)
- [x] クライアント側パスワード比較を廃止し、Edge Function(`app-login`)でサーバー側照合+トークン発行に移行
- [ ] Supabase Auth などの実認証へ移行(中期)

### その他セキュリティ
- [x] `scripts/google-drive-sync.js` のハードコード資格情報を GAS Script Properties へ移動(GAS側への反映は要確認)
- [ ] ストレージRLSの anon 全開放(`storage-setup-dev.sql` / `production-migrations.sql`)を authenticated 限定に
- [ ] 本文テーブル(newsletters / articles / event_cards 等)への RLS 適用

---

## 優先度高(実運用中機能のバグ)

### 日付処理のタイムゾーン混在
- [ ] `CircularsView.tsx:211-216, 510-512` — UTCパース(`new Date("YYYY-MM-DD")`)とローカル時刻比較の混在。JST以外の環境で1日ズレる
- [ ] 日付未設定のイベントカードが永久に表示され続ける問題(同:215)

### 記事⇔イベントカードの自動連携(新機能の土台)
- [ ] AI抽出済みの `event_date/event_time/event_location` から event_cards を自動生成し `linked_article_id` をセット
- [ ] カルーセルカードのタップで記事へジャンプ
- [ ] `NewsletterList.tsx:513-531` の `prompt()` ベタ入力UIをフォーム(記事選択+日付ピッカー)に置換

### 本文の改行問題(未解決・継続)
- [ ] remarkBreaks による改行バラバラ問題(`CircularsView.tsx:331,356` 等)
- [ ] 保存時の改行正規化 or remarkBreaks 除去の判断

---

## 新機能(2026-07-07 相談分)

### 週次ラジオ(紙媒体に依存しないラジオ生成)
- [ ] `radio_programs.newsletter_id` を NULL 許容に + `program_type`('monthly'/'weekly')追加
- [ ] `generateWeeklyRadioProgram`: 過去7日の記事 + 今後7〜14日のイベントを素材に週次台本を生成
- [ ] 管理画面に「今週のラジオを生成」ボタン(素材プレビュー付き)
- [ ] 将来: cron自動化(要サーバーサイドTTS化 — 現在 `radioService.ts:308` が `window.AudioContext` 依存)

### スケジュール→記事リンク(メディア価値向上)
- [ ] 上記「記事⇔イベントカードの自動連携」で実現(依存関係)
- [ ] 台本生成時に記事⇔イベントの相互参照を活かす

---

## 中期 TODO

### コード品質
- [ ] AIモデルID(`claude-sonnet-4-6`、6箇所ベタ書き)の定数化 — `claudeService.ts:64,430,673,767,910` / `openRouterService.ts:49`
- [ ] JSON修復ロジック(`repairJsonString`)の未適用箇所への展開 — `claudeService.ts:557,689,813,973` / `openRouterService.ts:260`
- [ ] 古いコメント修正(`claudeService.ts:39,838` の "Sonnet 4.5" 表記)
- [ ] `updateArticleOrders`(`newsletterService.ts:350-383`)の逐次UPDATE → upsert一括化
- [ ] サービス層の常駐 console.log の整理

### レガシー整理(apps/admin・apps/public)
- [ ] apps/admin は circulars と大幅乖離(直近のバグ修正が入っていない)— 廃止判断
- [ ] apps/public のカレンダー(`EventCalendarView.tsx`)は31日固定のハリボテ — 廃止 or 作り直し判断
- [ ] レガシーイベント実装(`PublicEvent` 型、`geminiService.ts:73` の `extractEventsFromText`、`MOCK_EVENTS`)の削除
- [ ] `control_date` の期限切れロジック(仕様のみで未実装)を実装するか仕様を削除

### インフラ・構成
- [ ] デプロイ設定の整理: ルート `vercel.json`(circulars専用)と各appの vercel.json の不整合解消
- [ ] SPAリライトの修正(ルート: `destination: "/"` → `/index.html`)
- [ ] node_modules の hoisting(workspaces が効いていない)と依存宣言の一本化
- [ ] `.gitattributes` 設定(LF/CRLF警告)

### 従来からの中期項目
- [ ] 記事編集のMarkdown対応改善(WYSIWYG vs ツールバー)
- [ ] PDFサムネイルのサーバーサイド生成
- [ ] 自治会ホームページ(トップページ)
- [ ] カラーパレット統一

---

## 長期 TODO(将来構想)

- [ ] デジタル入稿 → 広報紙PDF自動生成
- [ ] LINE連携(通知・リッチメニュー — 現在LINE関連コードは本リポジトリに無し)
- [ ] マルチ組織対応
- [ ] ユニットテスト(Vitest)/ E2E(Playwright)
- [ ] メール通知、アナリティクス、Stripe決済

---

## 完了済み(2026-07-07 点検で確認)

- [x] PDF → 記事抽出パイプライン(Claude AI)
- [x] 記事編集・並び替え・重複検出
- [x] ラジオ回覧板(月次・Gemini TTS)
- [x] バスダイヤ + ゴミカレンダー
- [x] イベントカード管理(event_cardsテーブル、CRUD完成)
- [x] マルチPDF対応、画像アップロード・クロップ・割り当て
- [x] モバイルレスポンシブUI、ダイジェスト音声、インラインプレーヤー
- [x] デバッグ用ログエンドポイント(7242/ingest)の除去(commit f69059a で削除済み)
- [x] AIモデルID更新(claude-sonnet-4-6 — 有効なIDであることを確認済み)
- [x] Google Drive連携スクリプト作成(GASデプロイは未実施)
