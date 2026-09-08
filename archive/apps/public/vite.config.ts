import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // プロジェクトルートの.envを読み込む
  const rootDir = path.resolve(__dirname, '../../');
  const env = loadEnv(mode, rootDir, '');
  return {
    root: '.',
    envDir: rootDir, // プロジェクトルートの.envを読み込む
    server: {
      port: 5174,
      host: '0.0.0.0',
    },
    plugins: [react()],
    build:{
      outDir: 'dist',
      sourcemap: false,
      minify: 'esbuild',
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
          },
        },
      },
    },
    define: {
      // 【セキュリティ】APIキー・パスワードはバンドルに含めない。
      // AI呼び出しは Supabase Edge Function（ai-proxy）経由、
      // パスワード照合は app-login 経由で行う。
      // 開発時のみ、各サービスが import.meta.env.VITE_* を直接参照する。

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
