# 関ヶ谷ポータル／カレンダー UI評価・改善計画（役員・事務局への引き継ぎ向け）

## Context
- portal（電子回覧板・レポート・週次配信など、sekigayajichikai.vercel.app）と book-system（カレンダー・会館予約、sekigaya-calendar.vercel.app）は、2026年9月から同じ Supabase（sekigaya-portal）を共有。RLS の第3段まで完了（2026-10-02）。
- 目的は、管理作業を**役員・事務局（主にPC。会館PCも含む）**に渡して、自分の管理負担をなくすこと。
- 進め方の判断: 「2つのUIをくっつける」だけでは負担は減らない。負担の正体は、①渡したら信用を失うバグ、②自分しか知らない手作業（パスワード同期・SQL・取込の判断）、③共有パスワード1本で誰が何をしたか分からないこと。この順に潰したうえで、管理画面を1つに統合する。

> **進み具合（2026-10-06）**: 団体マスタの一本化（2章の手順3のDB部分、C5・B11）が済んだ。
> 団体の名簿は `booking_organizations` だけになり、portal・book-system の両方がこれを読み書きする（詳細は `マスタ管理.md`）。
> 旧 `organizers` テーブルも 2026-10-06 に削除済み（控えは `organizers_backup_20261006`）。残りは団体の編集画面を1つにすること（フェーズ3の手順2で行う）。

---

## 1. 評価サマリー（ほかの人が「絶対つまずく」点）

### A. 渡したら事故になる（信用・データ破損）— 最優先
| # | 問題 | 場所 |
|---|---|---|
| A1 | 編集中のPDF「削除」は画面から消えるだけ。DB には記事が残り、トーストは「削除しました」と表示する | portal `CircularBoard.tsx:748-770` |
| A2 | 「取り消されます／破棄されます」と確認が出るが、実際は自動保存済み | `CircularBoard.tsx:678-686, 904-909` |
| A3 | 重複がある時とない時で保存タイミングが違う（自動保存か手動保存か） | `CircularBoard.tsx:521, 784-832` |
| A4 | 「中止する」を押しても、あとからダイアログが出てくる | `CircularBoard.tsx:392-400, 1319-1327` |
| A5 | 取込で、Web から入れた予約が「削除」行になり、「全て承認」→ 反映で物理削除される | book `api/import.ts:175-193`, `import-apply.ts:167-199` |
| A6 | 承認・却下・設定保存・団体保存などで `res.ok` を見ておらず、失敗しても成功したように見える | book `AdminDashboard.tsx:422-488`, `SettingsTab.tsx:74-84`, `QuickCreatePopover.tsx` |
| A7 | 予約保存は、サーバーの返事より前に「保存しました」が出る。二重押しもできる | book `App.tsx:358-375, 147` |
| A8 | 削除がすべて即時・永久（ゴミ箱もバックアップもない） | 両方 |
| A9 | ログインの失敗は理由に関係なく「パスワードが正しくありません」と出る。AI 用トークンが切れても再読み込みでは直らず、ログアウトが必要 | portal `PasswordLogin.tsx:49-51`, `AuthContext.tsx:123-171`, `aiProxyClient.ts:77` |

### B. 迷う・止まる（理解のつまずき）
- B1 公開ボタンが押せない理由が、ホバーのツールチップにしか書かれていない（`NewsletterList.tsx:508-510`）。
- B2 確認依頼リンクを手でコピーして送る必要があり、承認されたかも通知されない（`NewsletterList.tsx:1305-1345`）。
- B3 「プレビュー」と「公開プレビュー」の違いが分からない。公開済みの号で「編集する」を押すと複製ができる（`:392-447`）。
- B4 予定の手入力が prompt 4連発で、日付も文字入力（`NewsletterList.tsx:734-758`）。
- B5 古い案内文が残っている（`:1421-1426`）。もう動かない「カレンダー用JSONをコピー」も残っている（`EventCandidateDialog.tsx:1129-1132`）。
- B6 専門用語: Flex JSON、エイリアスID、API、Gemini/Claude、カスタムタイトル。呼び名も「回覧板／号／Newsletter」とばらばら。
- B7 回覧板は「確認が必要」なのにレポートは即時公開で、「確認」の仕組みが2種類ある（`ReportBoard.tsx:207-221`）。
- B8 カレンダー管理: 申請の件数はタブを開くまで0のまま（`AdminDashboard.tsx:462-493`）。未分類の予定が既定で表示されない（`:88-116`）。休館の切り替えに確認がない。
- B9 取込は、Excel のセル位置が決め打ち（I1/L1、行番号）、Drive は「リンクを知っている全員」での共有が前提、更新日は手入力。仕組みを知らない人には判断できない。
- B10 リッチメニューの対象者指定が、LINE のユーザーID（U+32桁）の貼り付け。
- B11 公開側の予定表で、新しい団体が表示フィルタに自動で入らない（localStorage）。祝日は今年分しか出ない。
  → 団体の部分は対応済み（book-system 14d2557: 改名・新しい団体に合わせて保存済みの絞り込みを直す。d3c8be3: 団体の番号で判定）。祝日は未対応。

### C. 引き継げない運用（管理負担そのもの）
- C1 共有パスワード1本。Supabase Auth と `APP_PASSWORD` を一致させておく必要があり、ずれると AI/LINE だけが黙って失敗する。
- C2 SQL を手で実行し、Edge Function のシークレットも手で設定。migration 番号の重複もある。
- C3 未完了のセキュリティ作業: `ORG_TOKEN_SECRET` が未設定、book 側の書き込み API 7本が無認証、`api/import.ts` の抜け道、漏れた API キーの差し替え、古い `.env.example`。
- C4 毎週の会館予定の取込・毎月の回覧板・週次配信が、すべて手動で起動。
- C5 団体名の表記ゆれ（関ヶ谷／関ケ谷、子供会／こども会）が、2つのマスタで別々に管理されている。
  → 対応済み（2026-10-05）。団体マスタを `booking_organizations` に一本化し、表記ゆれは別名（aliases）で正式名に寄せる。
- C6 マニュアルがない（UX提案 C-12）。book の README は AI Studio のテンプレのまま。旧 GAS ガイドも残っていて誤解のもと。

（管理画面は PC 前提で問題ない。スマホ対応は後回し。）

---

## 2. book-system 完全統合の案（推奨）

**結論: 管理画面を portal の `/admin` に一本化する。公開カレンダーの URL（sekigaya-calendar）は当面残す。コードは portal の monorepo に `apps/calendar` として取り込む。**

理由
- 管理者は1つの URL、1回のログイン、1つのマニュアルで済む。引き継ぐ範囲が半分になる。
- DB・ログインアカウント・団体マスタはすでに共通。いま残っている二重管理は、団体の編集画面が2つあること、2つの Vercel プロジェクトの環境変数、2つの CI。
- 公開側は住民がすでに URL（リッチメニュー）で使っているので、無理に動かさない。portal の公開ページからカレンダーへのリンクを足すだけにする。

統合の中身（段階的に進める）
1. `apps/calendar` として monorepo に移す。`packages/shared` の AuthContext・Supabase クライアント・ダイアログを共通で使う。
2. portal の `/admin` に「予定・会館」タブ群（予定／取込／申請／団体）を追加する。book の `AdminDashboard` 各タブを移植する。
   「団体」タブは、portal の `OrganizerManager`（別名・主催/発行元の候補）と book の団体設定（グループ・取込キーワード・パスコード・予約可否）を1画面にまとめる。
3. ~~主催者マスタと団体マスタを1つにまとめ、表記ゆれをなくす。~~ → DB は 2026-10-05 に一本化済み（`booking_organizations`）。旧 `organizers` も 2026-10-06 に削除済み。残りは上の手順2での編集画面の一本化。
4. 回覧板の公開時に自動でカレンダーへ反映する（今の「カレンダーに反映」の手押しをなくす）。
5. book の `/api` 書き込みを廃止し、RLS 付きの Supabase 直接書き込み、または Edge Function にまとめる（C3 も一緒に解消）。

※ 一気に作り直さず、統合の前に下の フェーズ0・1 を済ませる（バグを抱えたまま移すと二度手間になるため）。

---

## 3. 改善計画（順番）

### フェーズ0: 安全に渡せる状態にする（A群）← 今回の実施範囲

> **進み具合（2026-10-02）**: A1〜A9 を実装済み（ブランチ `fix/phase0-safety`。portal 4f0eb2f・b164c96／book-system 8f53e7a・1336276）。
> 残り: ① `sql/migrations/2026-10-02-trash-items.sql` を SQL Editor で実行、② 両ブランチを push してプレビューで確認、③ 本番へ。
> A8 は「削除フラグ」ではなく「削除直前に控えを trash_items へ取る」方式にした（読み取り箇所と RLS を触らずに済み、公開側に削除済みが漏れる心配がない）。
> 既知の制限: 号を戻しても「いいね」と保留画像は戻らない。予定を戻しても、予約との紐付け（event_id）は戻らない。
進め方: まず両リポジトリを pull（book-system は最新化）→ 計画を `portal/docs/UI評価・改善計画.md` に保存 → 下記を book/portal それぞれブランチを切って実装 → lint/typecheck/test/build を通す → コミット（push・PR はユーザー確認後）。
A8（論理削除＋ゴミ箱）はDB migration を伴うため、SQL は作成のみ・適用はユーザーが行う。
- A1〜A4: CircularBoard の保存モデルを「追加したら即保存」に統一する。削除は DB も消す。確認文を実際の動作に合わせる。中止したら後続処理を捨てる（AbortController またはフラグ）。
- A5: 取込の削除候補から、Web で作った予約（取込元を持たない行）を除外する。「全て承認」の対象から削除行は外す。
- A6・A7: 管理側の fetch をすべて共通のラッパー経由にし、`res.ok` を確認して失敗時はトーストを出す。予約保存はサーバーの返事を待ってから成功表示。送信中はボタンを無効にする。
- A9: ログイン失敗の理由を、パスワード違い／通信／設定で分けて表示する。AI トークンが切れたら自動で再取得し、だめなら再ログインへ誘導する。
- C3: 対応済み（book-system 2a9d524・24e0fc8・9eed0c0 で窓口の認証と団体通行証の署名を導入）。
- A8: 削除を論理削除（`deleted_at`）にして、管理画面に「ゴミ箱」を置く。portal・book の主要テーブルが対象。

### フェーズ1: 迷わない画面にする（B群）
- 公開ボタンの横に「確認依頼が必要です」と常に表示する（B1）。
- 確認依頼の「LINEで送る」ボタンと QR。承認されたら管理画面にバッジを出す（B2）。
- プレビューを1つにまとめる。説明文を付ける（B3）。
- 予定の手入力を `EventCardEditDialog` の流用に置き換える（B4）。
- 古い文言と JSON コピーボタンの削除、用語の統一表の作成と置換（B5・B6）。
- 申請件数をログイン時に取得してバッジ表示。未分類の予定を既定で表示。休館の切り替えに確認を付ける（B8）。
- 取込画面に「いつ・何をすればよいか」の手順ガイドを置く。portal の `MonthlyGuide` を流用する（B9）。

### フェーズ2: 引き継げる運用にする（C群）
- 個人アカウントと権限（UX提案 C-10）: 役員ごとに Supabase Auth のアカウントを作り、「回覧板担当／会館担当／管理者」の役割を付ける。共有パスワードと `APP_PASSWORD` の二重管理をやめ、Edge Function も Supabase の JWT で検証する（C1）。
- 操作ログ（B-9）: 誰がいつ公開・削除・承認したかを残す。
- 自動バックアップ（C-11）。
- 会館予定の取込を定期実行（Vercel Cron または Supabase のスケジュール）にし、差分だけを「確認待ち」にしておく（C4）。
- migration の番号を整理し、Supabase CLI で適用できるようにする（C2）。
- 引き継ぎマニュアル（C-12）: 月次・週次・会館・トラブル時の4本。

### フェーズ3: book-system 統合（2章の手順1〜5）

---

## 4. 主な変更ファイル
- portal: `apps/circulars/src/components/admin/CircularBoard.tsx`, `NewsletterList.tsx`, `EventCandidateDialog.tsx`, `WeeklyDigest.tsx`, `RichMenuManager.tsx`, `pages/AdminPage.tsx`, `packages/shared/components/PasswordLogin.tsx`, `packages/shared/contexts/AuthContext.tsx`, `packages/shared/services/aiProxyClient.ts`, `sql/migrations/*`
- book-system: `src/App.tsx`, `src/components/admin/AdminDashboard.tsx`, `ImportTab.tsx`, `SettingsTab.tsx`, `QuickCreatePopover.tsx`, `DetailPopover.tsx`, `api/import.ts`, `api/import-apply.ts`
- 流用するもの: portal の in-app dialog/トースト（UX提案 A-1 で導入済み）、`MonthlyGuide`、`EventCardEditDialog`、`calendarSyncService.ts`

## 5. 確認方法
- フェーズ0: ステージング（Supabase ブランチ）で、PDF追加→削除→再読み込みでDBから消えていること、取込でWeb予約が削除候補に出ないこと、ネットワーク遮断時に失敗トーストが出ることを手で確認する。CI（lint/typecheck/test/build）を通し、上の各ケースに Vitest を足す。
- フェーズ1: PC で役員1人に「回覧板1号の作成〜公開」「会館予定の取込〜反映」を説明なしでやってもらい、止まった箇所を記録する（ユーザーテスト）。
- フェーズ2: 個人アカウントでログインし、AI・LINE・取込がすべて動くこと、操作ログに名前が残ることを確認する。
- フェーズ3: 旧 book の管理画面を使わずに、1週間の運用を portal `/admin` だけで回せるか試す。
