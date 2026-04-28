# OpenRouter セットアップガイド

このガイドでは、OpenRouter APIを使用してPDF記事抽出機能を利用する方法を説明します。

## OpenRouterとは

OpenRouterは、複数のAIモデル（Claude、GPT-4、Geminiなど）を統一されたAPIで利用できるサービスです。

### メリット

- 💰 **コスト削減**: プロバイダー間の価格競争により、直接APIより安価
- 🔄 **柔軟性**: 複数のモデルを同じAPI形式で利用可能
- 🛡️ **安定性**: フォールバック機能で可用性向上
- 📊 **管理の簡素化**: 1つのAPIキーで複数モデルを管理

### デメリット

- ⏱️ **レイテンシー**: 中間サービスを経由するため若干の遅延
- 🔧 **最新機能**: 新機能の対応に遅れる可能性

## セットアップ手順

### 1. OpenRouterアカウントの作成

1. [openrouter.ai](https://openrouter.ai) にアクセス
2. 「Sign Up」をクリック
3. Googleアカウントまたはメールアドレスで登録

### 2. API Keyの取得

1. ログイン後、右上のアカウントアイコンをクリック
2. 「Keys」メニューを選択
3. 「Create Key」ボタンをクリック
4. Key名を入力（例: "CC-SaaS-Development"）
5. 生成されたキーをコピー（**このキーは二度と表示されません**）

### 3. クレジット購入（初回のみ）

1. 左メニューの「Credits」をクリック
2. 「Add Credits」で必要な金額をチャージ
   - 推奨: $5-10（テスト用）
   - 1PDF処理: 約$0.05-0.15

### 4. 環境変数の設定

プロジェクトルートに `.env` ファイルを作成：

```env
# OpenRouter設定
VITE_AI_PROVIDER=openrouter
VITE_OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx

# 使用するモデル（オプション）
VITE_OPENROUTER_MODEL=anthropic/claude-sonnet-4-20250514

# その他の設定
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_key
VITE_GEMINI_API_KEY=your_gemini_key
```

### 5. 動作確認

```bash
npm run dev
```

管理画面 → デジタル回覧板 → PDF広報誌タブ で動作確認

## 利用可能なモデル

### Claude系（推奨）

```env
# Claude Sonnet 4（最新・高性能）
VITE_OPENROUTER_MODEL=anthropic/claude-sonnet-4-20250514

# Claude 3.5 Sonnet（コスパ良好）
VITE_OPENROUTER_MODEL=anthropic/claude-3.5-sonnet

# Claude 3 Opus（最高品質）
VITE_OPENROUTER_MODEL=anthropic/claude-3-opus
```

### その他のモデル

```env
# GPT-4 Turbo
VITE_OPENROUTER_MODEL=openai/gpt-4-turbo

# Gemini Pro 1.5
VITE_OPENROUTER_MODEL=google/gemini-pro-1.5
```

### モデル選択のポイント

| モデル | 精度 | 速度 | コスト | 推奨用途 |
|--------|------|------|--------|----------|
| Claude Sonnet 4 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | PDF解析（推奨） |
| Claude 3.5 Sonnet | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | コスパ重視 |
| GPT-4 Turbo | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | 汎用AI処理 |

## フォールバック設定

両方のAPIキーを設定しておくと、自動的にフォールバックします：

```env
VITE_AI_PROVIDER=auto

# OpenRouterを優先的に使用
VITE_OPENROUTER_API_KEY=sk-or-v1-xxx

# OpenRouterが失敗した場合、Anthropicにフォールバック
VITE_ANTHROPIC_API_KEY=sk-ant-xxx
```

## トラブルシューティング

### エラー: "PDF処理に失敗しました"

**原因**: OpenRouterがPDF直接読み込みに対応していない可能性

**対処法**:
1. Anthropic APIキーも設定して、自動フォールバックを有効化
2. または `VITE_AI_PROVIDER=anthropic` で直接Anthropicを使用

### エラー: "Insufficient credits"

**原因**: クレジット残高不足

**対処法**:
1. [openrouter.ai/credits](https://openrouter.ai/credits) でチャージ
2. 使用量を確認: [openrouter.ai/activity](https://openrouter.ai/activity)

### レスポンスが遅い

**原因**: OpenRouterのレイテンシー

**対処法**:
1. より高速なモデルに変更（Claude 3.5 Sonnetなど）
2. Anthropic直接利用に切り替え

## コスト最適化

### 1. モデル選択

- **テスト環境**: Claude 3.5 Sonnet（コスパ良好）
- **本番環境**: Claude Sonnet 4（高品質）

### 2. 処理最適化

- 不要なPDF処理を避ける
- バッチ処理でまとめて実行
- キャッシュ機能の活用（将来実装予定）

### 3. 使用量モニタリング

OpenRouterダッシュボードで使用量を定期的に確認：
- [openrouter.ai/activity](https://openrouter.ai/activity)

## 参考リンク

- [OpenRouter 公式サイト](https://openrouter.ai)
- [OpenRouter ドキュメント](https://openrouter.ai/docs)
- [対応モデル一覧](https://openrouter.ai/models)
- [料金表](https://openrouter.ai/models#pricing)

## サポート

問題が発生した場合：

1. ブラウザのコンソールでエラーメッセージを確認
2. `PDF-FEATURE-SETUP.md` の全般的なトラブルシューティングを参照
3. OpenRouterのステータスページを確認: [status.openrouter.ai](https://status.openrouter.ai)
