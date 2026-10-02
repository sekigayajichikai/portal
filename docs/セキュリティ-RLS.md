# データベースを守る（公開鍵・ログイン・RLS）

回覧板ポータルとカレンダーアプリは、同じ Supabase プロジェクト `sekigaya-portal`
（`iplcopuwwzbtwoakqifh`）を共有している。SQL を書く場所は1つだけ。

AIキーの持ち出し対策は `docs/SECURITY-MIGRATION.md`（2026-07）。こちらはその続きで、
**データベース本体**の話。

## いまの構造（2026-10-01 時点の調査）

- **両アプリとも公開鍵（anon key）1本で動いている。** 強い鍵（service_role）はどこでも使っていない。
  公開鍵は公開サイトの JavaScript に埋まっているので、誰でも取り出せる。
- **ログインは形だけで、データベースには届いていない。**
  - ポータル … 合言葉を Edge Function `app-login` で照合し、印をブラウザに置く。
    マウント時はその印が「ある」ことしか見ない。
  - カレンダー … 署名のない文字列をブラウザに置くだけ。自分で作れば管理画面に入れる。
  - どちらも、データベースへの読み書きには何も付かない。全部「公開鍵の人」として実行される。
- **カレンダーアプリの書き込み用の窓口7本が無認証**（予約登録・インポート反映・Google ドライブ同期など）。
- Supabase Auth のユーザーは0人。`auth.uid()` に相当する判断材料がデータベース側に無い。

つまり RLS を厳しくするだけでは、管理画面も窓口も一斉に動かなくなる。
**ログインを本物にしてから**でないと成立しない。そこで3段に分ける。

## 第1段（2026-10-01 実施済み）

ログインを直さなくても塞げる穴だけを先に塞いだ。

### 団体のパスコードを隔離した

`booking_organizations.passcode` に平文で入っていて、公開鍵で全団体分が読めた。

- `booking_org_secrets`（org_id, passcode）に移し、RLS を有効にして**ポリシーを1つも置かない**。
  公開鍵からも、将来のログイン済みユーザーからも直接は触れない。
- 読み書きは中だけ特権で動く関数3本を通す。
  `verify_org_passcode`（照合）/ `set_org_passcode`（設定・解除）/ `has_org_passcode`（設定の有無）
- `booking_organizations.passcode` 列は削除した。
- 切り替えた場所: `book-system/api/auth.ts`、`vite.config.ts` の開発用モック、
  管理画面の団体マスタ（`AdminDashboard.tsx`）。
- 管理画面のパスコード欄は「設定済み（表示できません）」「未設定」の表示になり、
  入力すれば変更、ボタンで解除できる。

**確認の結果**（公開鍵で実際に試した）

| 試したこと | 結果 |
|---|---|
| 隔離先を読む | 中に1件あるのに0件に見える |
| 団体を全列取る | 24列。パスコードは含まれない |
| パスコードを名指しで要求 | 400（列が無い） |
| 団体ログインにわざと外した指定 | 401 |
| 関数に正しい指定 | 1件返る。1文字変えると0件 |

### 使っていない3テーブルを閉じた

`bus_schedules` / `radio_programs` / `calendar_banners`。いずれも0行で、
どちらのアプリからも参照されていない。RLS を有効にしてポリシーを置かない。
公開鍵からの書き込みは401で弾かれることを確認した。

**使われているので閉じなかったもの**（第3段で扱う）:
`booking_time_slots`（会館予約ビューが読む）、`booking_rooms`、`booking_equipment`、
`booking_usage_categories`、`general_import_rows`。

### 旧経路の抜け道を閉じた

`book-system/api/import-events.ts` は、鍵を知らなくても決め打ちの文字列で通った。これを外した。
この経路は 2026-09-29 以降使っていない（予定タブから `calendar_events` に直接書く方式に移行）。
カレンダー管理画面の「回覧板からの予定候補」の貼り付けボタンは401になる。一覧と承認は動く。

**同じ抜け道が `api/import.ts` に残っている。** 管理画面のインポートが使っているため、
Supabase Auth を入れてから外す（コードに TODO を書いてある）。

### 読み方の注意

RLS は読み取りをエラーで断らない。**行が無いかのように0件を返す**。
「200で0件」が守られている状態。書き込みは401/403で弾かれる。

### 使ったSQL

- `book-system/supabase/migration_019_passcode_isolation.sql`（隔離と関数）
- `book-system/supabase/migration_020_drop_passcode_column.sql`（元の列を削除）
- `CC-SaaS/sql/migrations/2026-10-01-close-unused-tables.sql`（3テーブルを閉じる）

## 第2段（未着手）: Supabase Auth を入れる

管理者アカウントを作り、両アプリのログインを置き換える。同じプロジェクトなので1つのアカウントで両方に入れる。

- ポータル … `packages/shared/contexts/AuthContext.tsx` を `signInWithPassword` に差し替え。
  書き込み箇所は触らなくてよい（同じクライアントがログイン状態を持つ）。
  `supabase/functions/ai-proxy/index.ts` のトークン検証を Supabase のものに変える。
- カレンダー … `src/components/admin/AdminLogin.tsx` と `App.tsx` の入口を差し替え。
- 窓口7本 … `book-system/api/` の書き込み系を強い鍵に切り替え、先頭でログイン済みかを確かめる。
  `vite.config.ts` に同じ処理が書き写されているので両方直す。
- 合言葉の入れ替えはこのときに行う。いまパスワードだけ変えても、通行証に署名が無いので意味がない。
- `set_org_passcode` の実行権限を、ログイン済みだけに絞る。

## 第3段（未着手）: RLS のポリシーを入れる

| 区分 | テーブル | 方針 |
|---|---|---|
| 公開して読ませる | `newsletters`(公開済みのみ) / `articles` / `event_cards` / `calendar_events` / `bookings` / `venues` / `organizers` / `booking_organizations` | 読むのは誰でも。書くのはログイン済みだけ |
| 住民も書く | `article_likes` | 条件を絞って誰でも。`UNIQUE(article_id, device_id)` の併用を検討 |
| 内部だけ | `weekly_digest_drafts` / `weekly_digest_sends` / `line_rich_menus` / `pending_images` / `import_batches` / `import_rows` / `app_settings` | ログイン済みだけ |

作り替えが必要な箇所が2つある。

- **確認用リンク（`/review/<token>`）** … いまは回覧板を全件取って画面側で絞っている。
  公開前の号を隠すと壊れるので、合言葉を渡して1件だけ返す関数を用意して差し替える。
- **ファイル置き場** … PDF と画像の3バケットが公開鍵で上書き・削除できる。
  読むのは誰でも、書くのはログイン済みだけに変える。

## 関連
- `docs/SECURITY-MIGRATION.md`（AIキーのサーバーサイド化。2026-07）
- `docs/カレンダー連携.md`（両アプリの関係）
