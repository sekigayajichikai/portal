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
    define: {
      // Gemini AI
      'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY),
      // AI Provider Selection
      'process.env.AI_PROVIDER': JSON.stringify(env.VITE_AI_PROVIDER),
      // OpenRouter
      'process.env.OPENROUTER_API_KEY': JSON.stringify(env.VITE_OPENROUTER_API_KEY),
      'process.env.OPENROUTER_MODEL': JSON.stringify(env.VITE_OPENROUTER_MODEL),
      // Anthropic Claude
      'process.env.ANTHROPIC_API_KEY': JSON.stringify(env.VITE_ANTHROPIC_API_KEY),
      // Supabase
      'process.env.SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
      // Stripe
      'process.env.STRIPE_PUBLISHABLE_KEY': JSON.stringify(env.VITE_STRIPE_PUBLISHABLE_KEY),
      // App Password
      'process.env.VITE_APP_PASSWORD': JSON.stringify(env.VITE_APP_PASSWORD),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@cc-saas/shared': path.resolve(__dirname, '../../packages/shared'),
      },
    },
  };
});
