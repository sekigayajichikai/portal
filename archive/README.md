# archive/ — 使っていないものの置き場

本番は `apps/circulars`（電子回覧板、https://sekigayajichikai.vercel.app）だけになったため、
初期の3アプリ構成で作ったものをここに移した（2026-09-08）。削除ではなく移動なので、必要になれば戻せる。

| 場所 | 中身 | 状態 |
|---|---|---|
| `apps/admin` | CommunityConnect 管理画面（会員管理・ラジオ・バス時刻表・ライフスタイル） | 2026-07-27 以降更新なし。旧デプロイ先 cc-saas-admin.vercel.app は 404 |
| `apps/public` | Machi Portal（一般向けポータル、カレンダーは仮実装） | 同上。cc-saas-public.vercel.app は 404 |
| `sql/features` | ラジオ番組・バス時刻表のテーブル定義（admin 専用） | 本番 DB には存在する場合があるが circulars は使わない |

## 戻し方
```
git mv archive/apps/admin apps/admin
npm install
```
`package.json` の scripts に `dev:admin` 等を足す（履歴 `git log -p -- package.json` を参照）。

## 次に整理してよさそうなもの（未着手）
- `packages/shared/services/data/radioService.ts` `busScheduleService.ts` と関連の型・定数は circulars から未使用。
- `packages/shared/index.ts` の該当 export を外せば bundle が少し軽くなる。
