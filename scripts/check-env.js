#!/usr/bin/env node

/**
 * 環境変数チェックスクリプト
 * 
 * 必要な環境変数が正しく設定されているか確認します。
 * 使い方: npm run check-env
 */

const fs = require('fs');
const path = require('path');

// 色付きコンソール出力用
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// 環境変数の定義
const envVars = {
  required: [
    {
      name: 'VITE_GEMINI_API_KEY',
      description: 'Gemini AI APIキー',
      example: 'AIza...',
      url: 'https://ai.google.dev/',
    },
  ],
  optional: [
    {
      name: 'VITE_SUPABASE_URL',
      description: 'Supabase プロジェクトURL',
      example: 'https://xxxxx.supabase.co',
      url: 'https://supabase.com/dashboard',
    },
    {
      name: 'VITE_SUPABASE_ANON_KEY',
      description: 'Supabase 匿名キー',
      example: 'eyJhbGc...',
      url: 'https://supabase.com/dashboard',
    },
    {
      name: 'VITE_STRIPE_PUBLISHABLE_KEY',
      description: 'Stripe 公開可能キー',
      example: 'pk_test_...',
      url: 'https://dashboard.stripe.com/apikeys',
    },
    {
      name: 'STRIPE_SECRET_KEY',
      description: 'Stripe シークレットキー（サーバーサイドのみ）',
      example: 'sk_test_...',
      url: 'https://dashboard.stripe.com/apikeys',
    },
    {
      name: 'SUPABASE_SERVICE_ROLE_KEY',
      description: 'Supabase サービスロールキー（管理者操作のみ）',
      example: 'eyJhbGc...',
      url: 'https://supabase.com/dashboard',
    },
  ],
};

// .envファイルを読み込む
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  
  if (!fs.existsSync(envPath)) {
    return null;
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const env = {};

  envContent.split('\n').forEach((line) => {
    // コメント行と空行をスキップ
    if (line.trim().startsWith('#') || line.trim() === '') return;

    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      env[key] = value;
    }
  });

  return env;
}

// 環境変数をチェック
function checkEnv() {
  console.log(`${colors.cyan}==============================================`);
  console.log(`環境変数チェック`);
  console.log(`==============================================${colors.reset}\n`);

  const env = loadEnv();

  if (!env) {
    console.log(`${colors.red}❌ .env ファイルが見つかりません${colors.reset}`);
    console.log(`\n.env.example をコピーして .env ファイルを作成してください:`);
    console.log(`  ${colors.cyan}cp .env.example .env${colors.reset}\n`);
    process.exit(1);
  }

  let hasErrors = false;
  let hasWarnings = false;

  // 必須の環境変数をチェック
  console.log(`${colors.blue}【必須の環境変数】${colors.reset}`);
  envVars.required.forEach((envVar) => {
    const value = env[envVar.name];
    const isSet = value && !value.includes('your_') && !value.includes('xxx');

    if (isSet) {
      console.log(`${colors.green}✓${colors.reset} ${envVar.name}`);
    } else {
      console.log(`${colors.red}✗${colors.reset} ${envVar.name} - ${envVar.description}`);
      console.log(`  例: ${envVar.example}`);
      console.log(`  取得先: ${envVar.url}\n`);
      hasErrors = true;
    }
  });

  // オプションの環境変数をチェック
  console.log(`\n${colors.blue}【オプションの環境変数】${colors.reset}`);
  envVars.optional.forEach((envVar) => {
    const value = env[envVar.name];
    const isSet = value && !value.includes('your_') && !value.includes('xxx');

    if (isSet) {
      console.log(`${colors.green}✓${colors.reset} ${envVar.name}`);
    } else {
      console.log(
        `${colors.yellow}○${colors.reset} ${envVar.name} - ${envVar.description} (未設定)`
      );
      hasWarnings = true;
    }
  });

  // 結果のサマリー
  console.log(`\n${colors.cyan}==============================================${colors.reset}`);

  if (hasErrors) {
    console.log(`${colors.red}❌ エラー: 必須の環境変数が設定されていません${colors.reset}`);
    console.log(`\n.env ファイルを編集して、必要なAPIキーを設定してください。\n`);
    process.exit(1);
  } else if (hasWarnings) {
    console.log(`${colors.yellow}⚠️  警告: 一部のオプション環境変数が未設定です${colors.reset}`);
    console.log(
      `\n機能を利用する場合は、対応する環境変数を設定してください。\n`
    );
  } else {
    console.log(`${colors.green}✅ すべての環境変数が正しく設定されています！${colors.reset}\n`);
  }
}

// スクリプト実行
checkEnv();
