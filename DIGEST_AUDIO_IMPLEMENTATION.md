# 回覧板ダイジェスト音声機能 実装完了

## 概要

デジタル回覧板に「聞く！回覧板（ダイジェスト版）」機能を実装しました。この機能により、回覧板の号数ごとにダイジェスト版の音声ファイルをアップロードし、会員が音声で回覧板の内容を聞くことができます。

## 実装内容

### 1. データベース拡張

**ファイル**: `add-digest-audio-columns.sql`

```sql
ALTER TABLE newsletters 
ADD COLUMN IF NOT EXISTS digest_audio_url TEXT,
ADD COLUMN IF NOT EXISTS digest_audio_filename TEXT;
```

**実行方法**:
1. Supabaseダッシュボードにログイン
2. SQL Editorを開く
3. `add-digest-audio-columns.sql` の内容を実行

### 2. 共通サービス (packages/shared)

#### 2.1 storageService.ts

新しい関数を追加:
- `uploadDigestAudio(file: File)`: ダイジェスト音声ファイルをアップロード
- `deleteDigestAudio(path: string)`: ダイジェスト音声ファイルを削除

**特徴**:
- ファイルサイズ制限: 50MB以下
- 対応フォーマット: mp3, wav, m4a
- 保存先: `radio` バケット（年/月/digest-ファイル名-タイムスタンプ.拡張子）

#### 2.2 newsletterService.ts

新しい関数を追加:
- `updateNewsletterDigestAudio(newsletterId, audioUrl, audioFilename)`: Newsletter音声情報を更新
- `deleteNewsletterDigestAudio(newsletterId)`: Newsletter音声情報を削除

#### 2.3 types/newsletter.ts

Newsletter型に新しいフィールドを追加:
```typescript
export interface Newsletter {
  // ... 既存フィールド
  digest_audio_url?: string | null;
  digest_audio_filename?: string | null;
}
```

### 3. Public側 (apps/public)

**ファイル**: `src/components/features/circulars/CircularsView.tsx`

#### 3.1 追加された機能

1. **ダイジェスト音声ボタン**
   - Newsletter選択ドロップダウンの直後、記事一覧の前に配置
   - 音声がアップロードされている場合のみ表示
   - アニメーション付きラジオアイコン（📻）
   - ホバー・クリック時のスケールアニメーション

2. **音声プレイヤーモーダル**
   - モーダル形式で表示
   - HTML5 `<audio>` 要素を使用
   - 機能:
     - 再生/一時停止ボタン
     - プログレスバー（クリックでシーク可能）
     - 現在時刻/総時間表示
     - 再生中のパルスアニメーション

#### 3.2 状態管理

```typescript
const [showDigestPlayer, setShowDigestPlayer] = useState(false);
const [isPlaying, setIsPlaying] = useState(false);
const [currentTime, setCurrentTime] = useState(0);
const [duration, setDuration] = useState(0);
const audioRef = React.useRef<HTMLAudioElement>(null);
```

### 4. Admin側 (apps/admin)

**ファイル**: `src/components/NewsletterList.tsx`

#### 4.1 追加された機能

1. **音声アップロードボタン**
   - ラジオ番組生成ボタンの隣に配置
   - ファイル選択ダイアログを表示
   - 既存音声がある場合は「音声を更新」と表示
   - アップロード中はローディング表示

2. **音声削除ボタン**
   - 音声がアップロードされている場合のみ表示
   - 確認ダイアログ付き
   - Storage と Newsletter テーブルの両方から削除

3. **音声プレビューセクション**
   - 紫色のグラデーション背景
   - HTML5 `<audio>` コントロール
   - ダウンロードボタン
   - 新しいタブで開くボタン

#### 4.2 アップロード処理

```typescript
const handleDigestAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  // 1. ファイルサイズチェック（50MB以下）
  // 2. 確認ダイアログ表示
  // 3. 音声ファイルをStorageにアップロード
  // 4. Newsletterテーブルを更新
  // 5. 画面を再読み込み
}
```

#### 4.3 削除処理

```typescript
const handleDeleteDigestAudio = async () => {
  // 1. 確認ダイアログ表示
  // 2. StorageからURLのパスを抽出して削除
  // 3. Newsletterテーブルの音声情報をnullに設定
  // 4. 画面を再読み込み
}
```

## テストチェックリスト

### データベース

- [ ] Supabase SQL Editorで `add-digest-audio-columns.sql` を実行
- [ ] newslettersテーブルに `digest_audio_url` と `digest_audio_filename` カラムが追加されたことを確認

### Admin側テスト

1. **音声アップロード**
   - [ ] デジタル回覧板を選択
   - [ ] 「ダイジェスト音声」ボタンをクリック
   - [ ] mp3, wav, または m4a ファイルを選択
   - [ ] アップロード成功メッセージが表示される
   - [ ] 音声プレビューセクションが表示される
   - [ ] 音声が再生できる

2. **ファイルサイズ制限**
   - [ ] 50MBを超えるファイルをアップロード
   - [ ] エラーメッセージが表示される

3. **音声の更新**
   - [ ] 既存の音声がある回覧板を選択
   - [ ] 「音声を更新」ボタンが表示される
   - [ ] 新しい音声をアップロード
   - [ ] 古い音声が上書きされる
   - [ ] 新しい音声が再生できる

4. **音声の削除**
   - [ ] 音声がある回覧板を選択
   - [ ] 「音声削除」ボタンが表示される
   - [ ] ボタンをクリック
   - [ ] 確認ダイアログが表示される
   - [ ] 削除成功メッセージが表示される
   - [ ] 音声プレビューセクションが非表示になる
   - [ ] 「音声削除」ボタンが非表示になる

### Public側テスト

1. **ボタンの条件表示**
   - [ ] 音声がない回覧板を選択
   - [ ] 「聞く！回覧板」ボタンが表示されない
   - [ ] 音声がある回覧板を選択
   - [ ] 「聞く！回覧板」ボタンが表示される

2. **音声再生**
   - [ ] 「聞く！回覧板」ボタンをクリック
   - [ ] モーダルが表示される
   - [ ] 回覧板のタイトルが表示される
   - [ ] 再生ボタン（▶️）をクリック
   - [ ] 音声が再生される
   - [ ] ボタンが一時停止ボタン（⏸️）に変わる
   - [ ] ラジオアイコンがアニメーションする
   - [ ] プログレスバーが進む
   - [ ] 現在時刻が更新される

3. **音声コントロール**
   - [ ] 一時停止ボタンをクリック
   - [ ] 音声が一時停止する
   - [ ] プログレスバーをクリック
   - [ ] 音声がシークされる
   - [ ] 音声が最後まで再生される
   - [ ] 自動的に停止し、時刻が0:00に戻る

4. **モーダル操作**
   - [ ] ×ボタンをクリック
   - [ ] モーダルが閉じる
   - [ ] 音声が停止する
   - [ ] モーダル外をクリック
   - [ ] モーダルが閉じる

### レスポンシブ対応

- [ ] スマートフォン表示で「聞く！回覧板」ボタンが適切に表示される
- [ ] スマートフォン表示でモーダルが適切に表示される
- [ ] タブレット表示で適切に表示される

## 使用技術

- **データベース**: Supabase (PostgreSQL)
- **ストレージ**: Supabase Storage
- **フロントエンド**: React + TypeScript
- **スタイリング**: Tailwind CSS
- **音声再生**: HTML5 Audio API

## ファイル一覧

### 新規作成
- `add-digest-audio-columns.sql` - データベースマイグレーション
- `DIGEST_AUDIO_IMPLEMENTATION.md` - このドキュメント

### 変更したファイル
- `packages/shared/services/storageService.ts` - 音声アップロード・削除関数
- `packages/shared/services/newsletterService.ts` - Newsletter更新関数
- `packages/shared/types/newsletter.ts` - Newsletter型定義
- `apps/public/src/components/features/circulars/CircularsView.tsx` - ボタン・プレイヤー
- `apps/admin/src/components/NewsletterList.tsx` - アップロード・削除機能

## 注意事項

1. **音声ファイルのフォーマット**
   - mp3, wav, m4a のみ対応
   - ブラウザの互換性のため、mp3 推奨

2. **ファイルサイズ**
   - 最大50MB
   - 大きすぎるファイルはアップロードできません

3. **Supabase Storage**
   - `radio` バケットの公開設定を確認
   - 認証済みユーザーのみアップロード可能

4. **パフォーマンス**
   - 音声ファイルはCDN経由で配信
   - キャッシュコントロール: 3600秒（1時間）

## 今後の拡張案

1. **音声の自動生成**
   - AIを使って回覧板の内容から音声を自動生成
   - Text-to-Speech (TTS) API の統合

2. **再生速度の調整**
   - 0.5x, 1.0x, 1.5x, 2.0x などの再生速度オプション

3. **ダウンロード機能**
   - Public側でも音声ファイルをダウンロード可能に

4. **再生履歴**
   - 最後に聞いた位置を記憶
   - 続きから再生機能

5. **音声の品質管理**
   - アップロード時の音声品質チェック
   - 自動的に最適なビットレートに変換
