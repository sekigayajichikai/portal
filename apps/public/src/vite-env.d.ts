/// <reference types="vite/client" />

/**
 * Vite 環境変数の型定義
 * import.meta.env で使用可能な環境変数を定義します
 */
interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string
  readonly GEMINI_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

