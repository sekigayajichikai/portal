import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // プロジェクトルートの.envを読み込む
  const rootDir = path.resolve(__dirname, '../../');
  const env = loadEnv(mode, rootDir, '');

  // デバッグ: 環境変数が読み込まれているか確認
  console.log('🔍 Vite環境変数チェック:');
  console.log('  VITE_GEMINI_API_KEY:', env.VITE_GEMINI_API_KEY ? '✅ 設定済み' : '❌ 未設定');
  console.log('  VITE_SUPABASE_URL:', env.VITE_SUPABASE_URL ? '✅ 設定済み' : '❌ 未設定');
  console.log('  VITE_APP_PASSWORD:', env.VITE_APP_PASSWORD ? '✅ 設定済み' : '❌ 未設定');

  return {
    root: '.',
    envDir: rootDir, // プロジェクトルートの.envを読み込む
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      // 【セキュリティ】APIキー・パスワードはバンドルに含めない。
      // 開発時（npm run dev:admin）は各サービスが import.meta.env.VITE_* を
      // 直接参照するため、ローカルのAI機能（PDF抽出・ラジオ生成）はそのまま動作する。
      // このアプリを公開デプロイする場合は ai-proxy / app-login 経由になる。

      // AI Provider Selection（非シークレット）
      'process.env.AI_PROVIDER': JSON.stringify(env.VITE_AI_PROVIDER),
      'process.env.OPENROUTER_MODEL': JSON.stringify(env.VITE_OPENROUTER_MODEL),
      // Supabase（anonキーは公開前提の値）
      'process.env.SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
      // Stripe（publishableキーは公開前提の値）
      'process.env.STRIPE_PUBLISHABLE_KEY': JSON.stringify(env.VITE_STRIPE_PUBLISHABLE_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@cc-saas/shared': path.resolve(__dirname, '../../packages/shared'),
      },
    },
  };
});
