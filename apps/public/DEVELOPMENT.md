
# Neighborhood Playground App - 開発ガイド

このドキュメントは、本プロジェクトのデザインシステム、データ構造、およびロジックの概要をまとめたものです。CursorなどのAIエディタを使用する際、このファイルをコンテキストとして読み込ませることで、開発効率が向上します。

---

## 1. デザインシステム (Tailwind CSS)

本アプリは「Playground（楽しさ）」と「Simple（実用性）」の2つのモードを持っています。

### 🎨 カラーパレット
`tailwind.config.js` のカスタマイズ、またはユーティリティクラスとして以下を使用します。

| 用途 | クラス名 / Hex | 説明 |
| :--- | :--- | :--- |
| **ベース背景** | `bg-[#FDFCF0]` | アプリ全体のベースとなるクリーム色。 |
| **テキスト** | `text-slate-800` (メイン), `text-slate-500` (サブ) | 可読性重視のダークグレー。 |
| **アクセント (火/重要)** | `bg-rose-400` / `text-rose-600` | 可燃ごみ、重要なお知らせ。 |
| **アクセント (資源/肯定)** | `bg-emerald-400` / `text-emerald-700` | 資源ごみ、安全、肯定的なアクション。 |
| **アクセント (バス/情報)** | `bg-blue-500` / `text-blue-700` | バス運行情報、リンク。 |
| **Gamified装飾** | `bg-yellow-400` | 遊び心のある強調、バッジ、アイコン背景。 |

### 📐 UI形状 (Border Radius & Shadow)
親しみやすさを強調するため、大きな角丸を使用します。

*   **カード (大):** `rounded-[2rem]` (32px) - メインコンテンツのコンテナ等
*   **カード (小):** `rounded-3xl` (24px) - イベントリスト、個別情報カード
*   **ボタン:** `rounded-full` (完全な円)
*   **入力フォーム:** `rounded-2xl` (16px)
*   **影:** `shadow-xl`, `shadow-2xl` を多用し、要素が浮いているような立体感を演出します。

---

## 2. データ構造 (JSONスキーマ)

バックエンドAPI実装時や、AIにモックデータを作らせる際の参照構造です。

### 🗑️ ゴミ収集情報 (`GarbageInfo`)
```json
{
  "type": "可燃ごみ",
  "icon": "🔥",
  "color": "bg-rose-400",
  "nextDate": "2024-05-21",
  "description": "生ごみ、紙くずなど"
}
```

### 🚌 バス時刻表 (`BusSchedule`)
```json
{
  "id": "1",
  "route": "21番",
  "destination": "中央駅前",
  "times": ["08:05", "08:25", "10:15", "12:00"] // HH:mm形式
}
```

### 🎉 イベント情報 (`Event`)
```json
{
  "id": "e1",
  "title": "夕暮れパークヨガ",
  "date": "2024-05-24",
  "time": "17:30",
  "location": "中央公園",
  "category": "sports", // festival | workshop | sports | other
  "image": "https://example.com/image.jpg"
}
```

### 📱 デジタル回覧板 (`Circular`)
```json
{
  "id": "c1",
  "title": "夏祭りのボランティア募集",
  "date": "2024-05-18",
  "content": "詳細テキスト...",
  "isRead": false,
  "groupReadRate": 45 // 0-100%
}
```

---

## 3. Playgroundモードの管理ロジック

### 現状の実装 (Current)
*   **State:** `App.tsx` 内の `isSimpleMode` (boolean) で管理。
*   **伝播:** 各機能コンポーネント（Dashboard, HomeView等）にPropsとして渡す。
*   **分岐:** `isSimpleMode ? 'シンプル用クラス' : 'Gamified用クラス'` のように三項演算子でスタイルと表示内容を切り替える。

### 将来の運用・管理 (Future)
Cursorで機能拡張する際は、以下の設計への移行を推奨します。

1.  **設定の永続化 (Persistence):**
    *   `localStorage` を利用し、ユーザーが一度「シンプルモード」を選んだら、リロード後も設定を維持する。
    
2.  **Configファイルによる管理:**
    *   `src/config.ts` 等を作成し、デフォルトの挙動を定数で管理する。
    ```typescript
    export const APP_CONFIG = {
      defaultMode: 'playground', 
      forceSimpleMode: false, // 災害時などに強制的にシンプルモードにするフラグ
    };
    ```

3.  **Feature Flag (リモート設定):**
    *   緊急時（災害情報表示時など）に、サーバーサイドの設定で全ユーザーの `isSimpleMode` を強制的に `true` にできるロジックを組み込むことを想定する。

---

## 4. ディレクトリ構成 (Refactored Structure)

```text
src/
├── components/
│   ├── layout/         # Header, BottomNav, MainLayout
│   ├── features/       # 各機能ごとのViewコンポーネント
│   │   ├── home/
│   │   ├── dashboard/
│   │   ├── bus/
│   │   ├── garbage/
│   │   ├── calendar/
│   │   └── radio/
│   │   └── ai-chat/
├── hooks/              # useBusSchedule 等のロジック
├── types/              # TypeScript型定義
├── utils/              # 定数、ヘルパー関数
└── services/           # Gemini API等の外部通信
```
