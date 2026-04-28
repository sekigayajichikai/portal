# デジタル回覧板システム 実装ガイド

## 📋 プロジェクト概要

### システム目的
- 自治会の紙の回覧板をデジタル化
- 忙しい会員が重要情報をサッと確認できる
- すべての情報を含む（情報の漏れなし）
- 他の自治会でも使える汎用性

### 技術スタック
- **フロントエンド**: React 19.2.3 + TypeScript 5.8.2 + Vite 6.2.0
- **データベース**: Supabase
- **AI**: Claude Sonnet 4.5 (Anthropic API)
- **スタイリング**: Tailwind CSS

---

## 🗂️ データベース設計（Supabase）

### テーブル構造

```sql
-- 組織（自治会）
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 会員
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'member', -- 'admin' | 'board' | 'member'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 広報誌（月号）
CREATE TABLE newsletters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id),
  title TEXT NOT NULL, -- "2025年12月号"
  issue_date DATE NOT NULL,
  source_pdf_url TEXT,
  status TEXT DEFAULT 'draft', -- 'draft' | 'published' | 'archived'
  created_by UUID REFERENCES members(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  published_at TIMESTAMP WITH TIME ZONE
);

-- 記事
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsletter_id UUID REFERENCES newsletters(id),
  organization_id UUID REFERENCES organizations(id),
  
  -- 基本情報
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL, -- 'high' | 'medium' | 'low'
  deadline DATE,
  
  -- 4段階要約（事前生成）
  headline TEXT NOT NULL, -- 5文字
  brief TEXT NOT NULL, -- 15文字
  summary TEXT NOT NULL, -- 40文字
  content TEXT NOT NULL, -- 全文
  
  -- メタ情報
  tags TEXT[] DEFAULT '{}',
  visibility TEXT DEFAULT 'members-only', -- 'public' | 'members-only' | 'board-only'
  public_summary TEXT, -- 地域向けページ用
  source TEXT, -- "関ヶ谷だより" | "会報ふれあい"
  attachments JSONB DEFAULT '[]',
  
  -- 順序・表示
  display_order INTEGER,
  is_pinned BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 既読管理
CREATE TABLE article_reads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id UUID REFERENCES articles(id),
  member_id UUID REFERENCES members(id),
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(article_id, member_id)
);

-- 設定（組織ごとのカスタマイズ）
CREATE TABLE organization_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id),
  
  -- カテゴリ設定
  categories JSONB NOT NULL DEFAULT '[
    {"id": "event", "label": "イベント", "icon": "🎉", "color": "blue"},
    {"id": "notice", "label": "お知らせ", "icon": "📢", "color": "yellow"},
    {"id": "meeting", "label": "会議", "icon": "📋", "color": "gray"},
    {"id": "culture", "label": "文化", "icon": "📚", "color": "purple"},
    {"id": "report", "label": "報告", "icon": "📊", "color": "green"}
  ]',
  
  -- 機能設定
  features JSONB NOT NULL DEFAULT '{
    "showCulturalSection": true,
    "showMeetingMinutes": true,
    "enablePublicPage": true,
    "enableMemberLogin": true
  }',
  
  -- 表示設定
  display_settings JSONB NOT NULL DEFAULT '{
    "primaryColor": "#3B82F6",
    "logo": null,
    "defaultViewMode": "normal"
  }',
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_articles_newsletter ON articles(newsletter_id);
CREATE INDEX idx_articles_organization ON articles(organization_id);
CREATE INDEX idx_articles_priority ON articles(priority);
CREATE INDEX idx_articles_deadline ON articles(deadline);
CREATE INDEX idx_article_reads_member ON article_reads(member_id);
```

---

## 📐 TypeScript型定義

```typescript
// types/database.ts

export type Priority = 'high' | 'medium' | 'low';
export type Visibility = 'public' | 'members-only' | 'board-only';
export type NewsletterStatus = 'draft' | 'published' | 'archived';
export type MemberRole = 'admin' | 'board' | 'member';
export type ViewMode = 'compact' | 'normal' | 'detailed';

export interface Organization {
  id: string;
  name: string;
  subdomain: string | null;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  organization_id: string;
  email: string;
  name: string;
  role: MemberRole;
  created_at: string;
}

export interface Newsletter {
  id: string;
  organization_id: string;
  title: string;
  issue_date: string;
  source_pdf_url: string | null;
  status: NewsletterStatus;
  created_by: string;
  created_at: string;
  published_at: string | null;
}

export interface Article {
  id: string;
  newsletter_id: string;
  organization_id: string;
  
  // 基本情報
  title: string;
  category: string;
  priority: Priority;
  deadline: string | null;
  
  // 4段階要約
  headline: string;
  brief: string;
  summary: string;
  content: string;
  
  // メタ情報
  tags: string[];
  visibility: Visibility;
  public_summary: string | null;
  source: string;
  attachments: Attachment[];
  
  // 表示
  display_order: number | null;
  is_pinned: boolean;
  
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  type: 'pdf' | 'image' | 'link';
  url: string;
  label: string;
}

export interface Category {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export interface OrganizationSettings {
  organization_id: string;
  categories: Category[];
  features: {
    showCulturalSection: boolean;
    showMeetingMinutes: boolean;
    enablePublicPage: boolean;
    enableMemberLogin: boolean;
  };
  display_settings: {
    primaryColor: string;
    logo: string | null;
    defaultViewMode: ViewMode;
  };
  updated_at: string;
}

export interface ArticleRead {
  id: string;
  article_id: string;
  member_id: string;
  read_at: string;
}
```

---

## 🤖 AI処理フロー

### PDFアップロード → 記事抽出の流れ

```typescript
// services/articleExtraction.ts

interface ExtractionResult {
  articles: Omit<Article, 'id' | 'newsletter_id' | 'organization_id' | 'created_at' | 'updated_at'>[];
  processingTime: number;
}

export async function extractArticlesFromPDF(
  pdfBase64: string,
  organizationSettings: OrganizationSettings
): Promise<ExtractionResult> {
  const startTime = Date.now();

  const prompt = `
あなたは自治会の広報誌を分析する専門家です。
以下の広報誌から記事を抽出し、構造化してください。

【抽出ルール】
1. 記事の区切り判断基準：
   - 見出し（大きな文字、太字）
   - 枠線や罫線で区切られたセクション
   - 明確な空白やレイアウトの変化
   - トピックの変化

2. 各記事に以下を付与：

**title（20文字以内）**: 記事の見出し。わかりやすく簡潔に。

**category**: 以下から選択
${organizationSettings.categories.map(c => `- ${c.id}: ${c.label}`).join('\n')}

**priority**: 
- high: 締切あり、要対応、全会員が必ず確認すべき情報
  例：施設休館、ゴミ収集変更、重要イベント、アンケート締切
- medium: 確認推奨のお知らせ、イベント告知
  例：コンサート、講座、一般的なイベント
- low: 参考情報、読み物、報告
  例：会議報告、募金結果、サークル活動

**deadline**: 締切日があれば YYYY-MM-DD 形式（なければnull）

**4段階要約**:
- headline: 5文字以内（例：どんど焼き、会館休館）
- brief: 15文字程度（例：1/10どんど焼き開催）
- summary: 40文字程度（いつ・どこで・何を が全部入る）
- content: 記事の本文全体を正確に

**tags**: 関連キーワード3-5個（配列）

**visibility**: 
- public: 地域全体に公開してOKな情報
- members-only: 会員限定（デフォルト）
- board-only: 役員のみ

**source**: この記事の出典（例：関ヶ谷だより、会報ふれあい）

**attachments**: PDFへのリンクが必要な場合のみ

3. 特殊な扱い：

**合同会議議事録**:
- 重要な決定事項は個別記事として抽出
- 議事録全文は1つの記事として、attachmentsにPDFリンク

**文化欄（俳句・図書など）**:
- category: "culture"
- priority: "low"
- すべて含める（省略しない）

4. 出力形式：
必ずJSON形式で返してください。前後の説明文は不要です。

{
  "articles": [
    {
      "title": "...",
      "category": "event",
      "priority": "high",
      "deadline": "2026-01-10",
      "headline": "どんど焼き",
      "brief": "1/10どんど焼き開催",
      "summary": "1月10日（土）11時～奥座公園でどんど焼き。お焚き上げ、豚汁振る舞い、餅つき体験",
      "content": "...",
      "tags": ["正月", "イベント", "奥座公園"],
      "visibility": "public",
      "source": "関ヶ谷だより",
      "attachments": []
    }
  ]
}
`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: pdfBase64
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    const textContent = data.content.find((c: any) => c.type === 'text')?.text;
    
    // JSONを抽出
    const jsonMatch = textContent.match(/```json\n?([\s\S]*?)\n?```/) || 
                     textContent.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('JSONレスポンスが見つかりません');
    }

    const result = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    
    return {
      articles: result.articles,
      processingTime: Date.now() - startTime
    };

  } catch (error) {
    console.error('Article extraction error:', error);
    throw error;
  }
}
```

---

## 🎨 UI設計方針

### 画面構成

```
1. 管理者画面（/admin）
   - PDFアップロード
   - AI処理実行
   - 記事の確認・編集
   - 公開

2. 会員向けページ（/）
   - 記事一覧（優先度別）
   - フィルター・検索
   - 文化欄（独立セクション）
   - アーカイブ

3. 地域向けページ（/public）
   - 公開記事のみ表示
   - シンプルなデザイン
```

### 表示優先度の設計

**Q1. 初期表示**
- ✅ 重要（high）: デフォルト展開
- ✅ 確認推奨（medium）: デフォルト展開
- ❌ 参考情報（low）: デフォルト折りたたみ

**Q2. 地域向けページとの違い**
- 会員向け: すべての記事（visibility: members-only含む）
- 地域向け: visibility: public のみ

**Q3. 文化欄の扱い**
- 独立セクションとして表示
- タブまたは画面下部に配置
- 俳句・図書はすべて含める

**Q4. 合同会議議事録**
- 重要項目は個別記事化
- 議事録全文は要約+PDFリンク

---

## 🔧 コンポーネント構造

```
src/
├── components/
│   ├── admin/
│   │   ├── PDFUploader.tsx
│   │   ├── ArticleEditor.tsx
│   │   └── NewsletterManager.tsx
│   ├── articles/
│   │   ├── ArticleCard.tsx
│   │   ├── ArticleList.tsx
│   │   ├── ArticleFilters.tsx
│   │   └── ViewModeToggle.tsx
│   ├── cultural/
│   │   ├── CulturalSection.tsx
│   │   ├── HaikuDisplay.tsx
│   │   └── BookList.tsx
│   └── layout/
│       ├── Header.tsx
│       ├── Sidebar.tsx
│       └── Footer.tsx
├── pages/
│   ├── Dashboard.tsx
│   ├── AdminPanel.tsx
│   └── PublicView.tsx
├── services/
│   ├── articleExtraction.ts
│   ├── supabase.ts
│   └── claudeApi.ts
├── hooks/
│   ├── useArticles.ts
│   ├── useOrganization.ts
│   └── useAuth.ts
└── types/
    └── database.ts
```

---

## 📝 実装の優先順位

### Phase 1: コア機能（2週間）
- [ ] Supabaseセットアップ
- [ ] 型定義作成
- [ ] PDFアップロード機能
- [ ] Claude APIで記事抽出
- [ ] 記事一覧表示（優先度別）
- [ ] 表示モード切替（compact/normal/detailed）

### Phase 2: UX改善（1週間）
- [ ] フィルター機能
- [ ] 検索機能
- [ ] 文化欄の独立表示
- [ ] 既読管理
- [ ] レスポンシブ対応

### Phase 3: 管理機能（1週間）
- [ ] 管理者画面
- [ ] 記事の手動編集
- [ ] 公開/非公開制御
- [ ] プレビュー機能

### Phase 4: 汎用化（2週間）
- [ ] 組織設定UI
- [ ] カテゴリカスタマイズ
- [ ] マルチテナント対応
- [ ] テンプレート機能

---

## 🚀 セットアップ手順

### 1. Supabaseプロジェクト作成

1. https://supabase.com で新規プロジェクト作成
2. SQL Editorで上記のDDLを実行
3. API設定から以下を取得：
   - Project URL
   - anon/public key

### 2. 環境変数設定

`.env`ファイルを作成：

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_ANTHROPIC_API_KEY=your_anthropic_key
```

### 3. 初期データ投入

```sql
-- テスト用組織
INSERT INTO organizations (name, subdomain) 
VALUES ('関ヶ谷自治会', 'sekigaya');

-- テスト用管理者
INSERT INTO members (organization_id, email, name, role) 
VALUES (
  (SELECT id FROM organizations WHERE name = '関ヶ谷自治会'),
  'admin@sekigaya.example.com',
  '管理者',
  'admin'
);

-- 組織設定
INSERT INTO organization_settings (organization_id)
VALUES ((SELECT id FROM organizations WHERE name = '関ヶ谷自治会'));
```

---

## 💡 Cursor使用時のヒント

### 効果的なプロンプト例

```
このデータベース設計に基づいて、[機能名]を実装してください。

[このドキュメントの該当部分を貼り付け]

要件:
- [具体的な要件1]
- [具体的な要件2]

既存のコードと統合できるようにしてください。
```

### ファイル分割の推奨

1つの大きなプロンプトではなく、機能ごとに分けて実装：

1. データベース設定
2. 型定義
3. Supabaseクライアント
4. 記事抽出機能
5. 記事一覧表示
6. ...

---

## 📚 参考情報

### 重要な設計判断

- **4段階要約**: 事前に全生成（ユーザーの閲覧時は切替のみ）
- **優先度**: 重要・確認推奨は展開、参考は折りたたみ
- **文化欄**: 独立セクション（省略しない）
- **議事録**: 重要項目を個別記事化
- **地域向け**: visibility=publicのみ表示

### API使用の注意点

- Claude API: PDFは1回の処理で全記事抽出
- コスト: 1PDF（10-20記事）で約$0.10-0.20
- 処理時間: 20-60秒程度

---

このドキュメントを参考に、段階的に実装を進めてください。