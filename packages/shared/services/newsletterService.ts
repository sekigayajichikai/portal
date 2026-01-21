/**
 * Newsletter サービス
 * 
 * NewsletterとArticleのCRUD操作を提供します。
 * Supabaseデータベースとの連携を担当します。
 * 
 * @module services/newsletterService
 */

import { getSupabaseClient } from './supabaseClient.js';
import { Newsletter, Article } from '../types/index.js';

/**
 * Newsletterと記事を保存
 * 
 * PDFから抽出したNewsletterと記事をSupabaseに保存します。
 * トランザクション的に処理され、Newsletter保存後に記事を一括保存します。
 * 
 * @param newsletter - 保存するNewsletter情報（idとcreated_atは自動生成）
 * @param articles - 保存する記事の配列（idとnewsletter_idは自動設定）
 * @returns 保存されたNewsletterと記事の配列
 * @throws Supabase未接続またはデータベースエラー
 */
export async function saveNewsletter(
  newsletter: Omit<Newsletter, 'id' | 'created_at'>,
  articles: Omit<Article, 'id' | 'newsletter_id' | 'created_at' | 'updated_at'>[]
): Promise<{ newsletter: Newsletter; articles: Article[] }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log('📝 Newsletterを保存中...', newsletter.title);

  // 1. Newsletterを保存
  const { data: savedNewsletter, error: newsletterError } = await supabase
    .from('newsletters')
    .insert([newsletter])
    .select()
    .single();

  if (newsletterError) {
    console.error('❌ Newsletter保存エラー:', newsletterError);
    throw newsletterError;
  }

  console.log('✅ Newsletter保存完了:', savedNewsletter.id);

  // 2. 記事を保存（newsletter_idを設定）
  const articlesWithNewsletterId = articles.map((article, index) => ({
    ...article,
    newsletter_id: savedNewsletter.id,
    display_order: index, // 順序を保持
  }));

  console.log(`📄 ${articlesWithNewsletterId.length}件の記事を保存中...`);

  const { data: savedArticles, error: articlesError } = await supabase
    .from('articles')
    .insert(articlesWithNewsletterId)
    .select();

  if (articlesError) {
    console.error('❌ 記事保存エラー:', articlesError);
    throw articlesError;
  }

  console.log('✅ 記事保存完了:', savedArticles.length, '件');

  return {
    newsletter: savedNewsletter,
    articles: savedArticles,
  };
}

/**
 * Newsletter一覧を取得（記事数も含む）
 * 
 * 保存されている全Newsletterを新しい順に取得します。
 * 各Newsletterに紐づく記事の件数も同時に取得します。
 * 
 * @returns Newsletter配列（article_countプロパティ付き）
 * @throws Supabase未接続またはデータベースエラー
 */
export async function getNewsletters(): Promise<
  Array<Newsletter & { article_count: number }>
> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log('📋 Newsletter一覧を取得中...');

  const { data, error } = await supabase
    .from('newsletters')
    .select(`
      *,
      articles(count)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Newsletter取得エラー:', error);
    throw error;
  }

  console.log('✅ Newsletter取得完了:', data.length, '件');

  // 記事数を展開
  const newsletters = data.map((item: any) => ({
    id: item.id,
    organization_id: item.organization_id,
    title: item.title,
    issue_date: item.issue_date,
    source_pdf_url: item.source_pdf_url,
    status: item.status,
    created_by: item.created_by,
    created_at: item.created_at,
    published_at: item.published_at,
    article_count: item.articles[0]?.count || 0,
  }));

  return newsletters;
}

/**
 * 特定のNewsletterの記事を取得
 * 
 * Newsletter IDに紐づく全記事をdisplay_order順に取得します。
 * 
 * @param newsletterId - NewsletterのUUID
 * @returns 記事の配列
 * @throws Supabase未接続またはデータベースエラー
 */
export async function getArticlesByNewsletterId(
  newsletterId: string
): Promise<Article[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log('📄 記事を取得中... Newsletter ID:', newsletterId);

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('newsletter_id', newsletterId)
    .order('display_order', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('❌ 記事取得エラー:', error);
    throw error;
  }

  console.log('✅ 記事取得完了:', data.length, '件');

  return data;
}

/**
 * 既存のNewsletterに新しい記事を追加
 * 
 * 既に保存されているNewsletterに対して、追加のPDFから抽出した記事を追加します。
 * 既存の記事数を取得して、display_orderを連番で設定します。
 * 
 * @param newsletterId - 追加先のNewsletter ID
 * @param newArticles - 追加する記事の配列
 * @returns 追加された記事の配列
 * @throws Supabase未接続またはデータベースエラー
 */
export async function addArticlesToNewsletter(
  newsletterId: string,
  newArticles: Omit<Article, 'id' | 'newsletter_id' | 'created_at' | 'updated_at'>[]
): Promise<Article[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log(`📝 Newsletterに記事を追加中... ID: ${newsletterId}, 追加記事数: ${newArticles.length}`);

  // 1. 既存記事の最大display_orderを取得
  const { data: existingArticles, error: fetchError } = await supabase
    .from('articles')
    .select('display_order')
    .eq('newsletter_id', newsletterId)
    .order('display_order', { ascending: false, nullsFirst: false })
    .limit(1);

  if (fetchError) {
    console.error('❌ 既存記事取得エラー:', fetchError);
    throw fetchError;
  }

  // 次のdisplay_orderを計算
  const nextDisplayOrder = existingArticles && existingArticles.length > 0
    ? (existingArticles[0].display_order ?? 0) + 1
    : 0;

  console.log(`📋 既存記事の次の順序: ${nextDisplayOrder}`);

  // 2. 新規記事にnewsletter_idとdisplay_orderを設定
  const articlesWithMetadata = newArticles.map((article, index) => ({
    ...article,
    newsletter_id: newsletterId,
    display_order: nextDisplayOrder + index,
  }));

  console.log(`📄 ${articlesWithMetadata.length}件の記事を追加中...`);

  // 3. 記事を追加
  const { data: savedArticles, error: insertError } = await supabase
    .from('articles')
    .insert(articlesWithMetadata)
    .select();

  if (insertError) {
    console.error('❌ 記事追加エラー:', insertError);
    throw insertError;
  }

  console.log('✅ 記事追加完了:', savedArticles.length, '件');

  return savedArticles;
}

/**
 * Newsletter削除（記事も一緒に削除される）
 * 
 * ON DELETE CASCADEにより、Newsletterを削除すると
 * 紐づく記事も自動的に削除されます。
 * 
 * @param newsletterId - 削除するNewsletterのUUID
 * @throws Supabase未接続またはデータベースエラー
 */
export async function deleteNewsletter(newsletterId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log('🗑️ Newsletterを削除中... ID:', newsletterId);

  const { error } = await supabase
    .from('newsletters')
    .delete()
    .eq('id', newsletterId);

  if (error) {
    console.error('❌ Newsletter削除エラー:', error);
    throw error;
  }

  console.log('✅ Newsletter削除完了');
}

/**
 * 記事を更新
 * 
 * 既存の記事の内容を部分的に更新します。
 * updated_atタイムスタンプは自動的に現在時刻に更新されます。
 * 
 * @param articleId - 更新する記事のUUID
 * @param updates - 更新するフィールドと値のオブジェクト
 * @returns 更新後の記事データ
 * @throws Supabase未接続またはデータベースエラー
 * 
 * @example
 * ```typescript
 * await updateArticle('article-123', {
 *   title: '新しいタイトル',
 *   priority: 'high',
 *   content: '更新された内容'
 * });
 * ```
 */
export async function updateArticle(
  articleId: string,
  updates: Partial<Omit<Article, 'id' | 'newsletter_id' | 'organization_id' | 'created_at'>>
): Promise<Article> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log('📝 記事を更新中... ID:', articleId);

  // updated_atを現在時刻に設定
  const updatesWithTimestamp = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('articles')
    .update(updatesWithTimestamp)
    .eq('id', articleId)
    .select()
    .single();

  if (error) {
    console.error('❌ 記事更新エラー:', error);
    throw error;
  }

  console.log('✅ 記事更新完了:', articleId);

  return data;
}

/**
 * 複数記事のdisplay_orderを一括更新
 * 
 * ドラッグ&ドロップなどで記事の順序を変更した際に使用します。
 * 記事IDと新しいdisplay_orderの配列を受け取り、一括で更新します。
 * 
 * @param updates - 記事IDとdisplay_orderのペアの配列
 * @returns 更新された記事の数
 * @throws Supabase未接続またはデータベースエラー
 * 
 * @example
 * ```typescript
 * await updateArticleOrders([
 *   { articleId: 'article-1', displayOrder: 0 },
 *   { articleId: 'article-2', displayOrder: 1 },
 *   { articleId: 'article-3', displayOrder: 2 }
 * ]);
 * ```
 */
export async function updateArticleOrders(
  updates: Array<{ articleId: string; displayOrder: number }>
): Promise<number> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log(`📋 ${updates.length}件の記事の順序を更新中...`);

  // 各記事を個別に更新（Supabaseは一括更新のupsertをサポート）
  let updatedCount = 0;
  
  for (const { articleId, displayOrder } of updates) {
    const { error } = await supabase
      .from('articles')
      .update({
        display_order: displayOrder,
        updated_at: new Date().toISOString(),
      })
      .eq('id', articleId);

    if (error) {
      console.error(`❌ 記事順序更新エラー (ID: ${articleId}):`, error);
      throw error;
    }
    
    updatedCount++;
  }

  console.log(`✅ ${updatedCount}件の記事順序を更新完了`);

  return updatedCount;
}
