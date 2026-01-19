/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // カスタムカラーパレット（DEVELOPMENT.mdに基づく）
        'base-bg': '#FDFCF0', // ベース背景（クリーム色）
      },
      borderRadius: {
        // カスタム角丸設定
        'card-lg': '2rem', // 32px - メインコンテンツのコンテナ等
        'card-sm': '1.5rem', // 24px - イベントリスト、個別情報カード
      },
      fontFamily: {
        // M PLUS Rounded 1cフォント
        'rounded': ['M PLUS Rounded 1c', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

