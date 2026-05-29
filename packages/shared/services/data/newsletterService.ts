/**
 * Newsletter サービス
 *
 * NewsletterとArticleのCRUD操作を提供します。
 * Supabaseデータベースとの連携を担当します。
 *
 * @module services/newsletterService
 */

import { getSupabaseClient } from '../supabaseClient.js';
import { Newsletter, Article } from '../../types/index.js';

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
export async function getNewsletters(
  statusFilter?: 'draft' | 'published' | 'archived'
): Promise<
  Array<Newsletter & { article_count: number }>
> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log('📋 Newsletter一覧を取得中...', statusFilter ? `(status: ${statusFilter})` : '');

  let query = supabase
    .from('newsletters')
    .select(`
      *,
      articles(count)
    `);

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Newsletter取得エラー:', error);
    throw error;
  }

  const safeData = data ?? [];
  console.log('✅ Newsletter取得完了:', safeData.length, '件');

  // 記事数を展開（Supabaseの返却形式が配列/オブジェクトどちらでも対応）
  const newsletters = safeData.map((item: any) => {
    const count =
      Array.isArray(item.articles)
        ? item.articles[0]?.count
        : item.articles?.count;
    return {
      id: item.id,
      organization_id: item.organization_id,
      title: item.title,
      issue_date: item.issue_date,
      source_pdf_url: item.source_pdf_url,
      source_pdf_urls: item.source_pdf_urls || [],
      status: item.status,
      created_by: item.created_by,
      created_at: item.created_at,
      published_at: item.published_at,
      parent_id: item.parent_id || null,
      digest_audio_url: item.digest_audio_url,
      digest_audio_filename: item.digest_audio_filename,
      article_count: count ?? 0,
    };
  });

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

/**
 * 記事を削除
 *
 * 指定された記事をデータベースから削除します。
 *
 * @param articleId - 削除する記事のUUID
 * @throws Supabase未接続またはデータベースエラー
 *
 * @example
 * ```typescript
 * await deleteArticle('article-123');
 * ```
 */
export async function deleteArticle(articleId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log('🗑️ 記事を削除中... ID:', articleId);

  const { error } = await supabase
    .from('articles')
    .delete()
    .eq('id', articleId);

  if (error) {
    console.error('❌ 記事削除エラー:', error);
    throw error;
  }

  console.log('✅ 記事削除完了');
}

/**
 * Newsletterのダイジェスト音声情報を更新
 *
 * 指定されたNewsletterにダイジェスト版音声ファイルのURLとファイル名を設定します。
 *
 * @param newsletterId - 更新するNewsletterのUUID
 * @param audioUrl - ダイジェスト音声ファイルの公開URL
 * @param audioFilename - ダイジェスト音声ファイルの元のファイル名
 * @returns 更新後のNewsletterデータ
 * @throws Supabase未接続またはデータベースエラー
 *
 * @example
 * ```typescript
 * await updateNewsletterDigestAudio(
 *   'newsletter-123',
 *   'https://example.com/audio.mp3',
 *   'digest-audio.mp3'
 * );
 * ```
 */
export async function updateNewsletterDigestAudio(
  newsletterId: string,
  audioUrl: string,
  audioFilename: string
): Promise<Newsletter> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log('📝 Newsletterのダイジェスト音声情報を更新中... ID:', newsletterId);

  const { data, error } = await supabase
    .from('newsletters')
    .update({
      digest_audio_url: audioUrl,
      digest_audio_filename: audioFilename,
    })
    .eq('id', newsletterId)
    .select()
    .single();

  if (error) {
    console.error('❌ Newsletter音声情報更新エラー:', error);
    throw error;
  }

  console.log('✅ Newsletter音声情報更新完了:', newsletterId);

  return data;
}

/**
 * Newsletterのダイジェスト音声情報を削除
 *
 * 指定されたNewsletterのダイジェスト音声情報（URLとファイル名）をnullに設定します。
 *
 * @param newsletterId - 更新するNewsletterのUUID
 * @returns 更新後のNewsletterデータ
 * @throws Supabase未接続またはデータベースエラー
 *
 * @example
 * ```typescript
 * await deleteNewsletterDigestAudio('newsletter-123');
 * ```
 */
export async function deleteNewsletterDigestAudio(
  newsletterId: string
): Promise<Newsletter> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log('🗑️ Newsletterのダイジェスト音声情報を削除中... ID:', newsletterId);

  const { data, error } = await supabase
    .from('newsletters')
    .update({
      digest_audio_url: null,
      digest_audio_filename: null,
    })
    .eq('id', newsletterId)
    .select()
    .single();

  if (error) {
    console.error('❌ Newsletter音声情報削除エラー:', error);
    throw error;
  }

  console.log('✅ Newsletter音声情報削除完了:', newsletterId);

  return data;
}

/**
 * NewsletterのソースPDF URLを更新
 *
 * @param newsletterId - 更新するNewsletterのUUID
 * @param pdfUrl - ソースPDFの公開URL
 * @returns 更新後のNewsletterデータ
 */
export async function updateNewsletterSourcePdf(
  newsletterId: string,
  pdfUrl: string
): Promise<Newsletter> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log('📝 NewsletterのソースPDF URLを更新中... ID:', newsletterId);

  const { data, error } = await supabase
    .from('newsletters')
    .update({ source_pdf_url: pdfUrl })
    .eq('id', newsletterId)
    .select()
    .single();

  if (error) {
    console.error('❌ Newsletter PDF URL更新エラー:', error);
    throw error;
  }

  console.log('✅ Newsletter PDF URL更新完了:', newsletterId);

  return data;
}

/**
 * NewsletterにPDF URLを追加（複数PDF対応）
 *
 * source_pdf_urls配列にURLを追加し、source_pdf_urlも最初のものを維持します。
 *
 * @param newsletterId - NewsletterのUUID
 * @param pdfUrl - 追加するPDFのURL
 * @returns 更新後のNewsletterデータ
 */
export async function addPdfUrlToNewsletter(
  newsletterId: string,
  pdfUrl: string,
  label?: string,
  publisher?: string,
  pdfType?: 'source' | 'attachment',
  thumbnailUrl?: string
): Promise<Newsletter> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  // 現在のNewsletterを取得
  const { data: current, error: fetchError } = await supabase
    .from('newsletters')
    .select('source_pdf_url, source_pdf_urls')
    .eq('id', newsletterId)
    .single();

  if (fetchError) throw fetchError;

  const existingEntries: any[] = current?.source_pdf_urls || [];
  // 後方互換: 文字列配列の場合はオブジェクトに変換
  const normalized = existingEntries.map((entry: any) =>
    typeof entry === 'string' ? { url: entry, label: '' } : entry
  );
  normalized.push({ url: pdfUrl, label: label || '', publisher: publisher || '', type: pdfType || 'attachment', thumbnail: thumbnailUrl || '' });

  const { data, error } = await supabase
    .from('newsletters')
    .update({
      source_pdf_url: current?.source_pdf_url || pdfUrl,
      source_pdf_urls: normalized,
    })
    .eq('id', newsletterId)
    .select()
    .single();

  if (error) throw error;

  console.log(`✅ PDF URL追加完了 (${normalized.length}件):`, newsletterId);
  return data;
}

/**
 * NewsletterのPDFラベルを更新
 */
export async function updatePdfLabel(
  newsletterId: string,
  pdfUrl: string,
  newLabel: string,
  newPublisher?: string
): Promise<Newsletter> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');

  const { data: current, error: fetchError } = await supabase
    .from('newsletters')
    .select('source_pdf_urls')
    .eq('id', newsletterId)
    .single();

  if (fetchError) throw fetchError;

  const entries: any[] = current?.source_pdf_urls || [];
  const updated = entries.map((e: any) => {
    const url = typeof e === 'string' ? e : e.url;
    if (url === pdfUrl) {
      const existing = typeof e === 'string' ? {} : e;
      return { ...existing, url, label: newLabel, ...(newPublisher !== undefined ? { publisher: newPublisher } : {}) };
    }
    return typeof e === 'string' ? { url: e, label: '' } : e;
  });

  const { data, error } = await supabase
    .from('newsletters')
    .update({ source_pdf_urls: updated })
    .eq('id', newsletterId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * NewsletterからPDF URLを削除
 */
export async function removePdfUrlFromNewsletter(
  newsletterId: string,
  pdfUrl: string
): Promise<Newsletter> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');

  const { data: current, error: fetchError } = await supabase
    .from('newsletters')
    .select('source_pdf_url, source_pdf_urls')
    .eq('id', newsletterId)
    .single();

  if (fetchError) throw fetchError;

  const entries: any[] = current?.source_pdf_urls || [];
  const filtered = entries.filter((e: any) => {
    const url = typeof e === 'string' ? e : e.url;
    return url !== pdfUrl;
  });

  const { data, error } = await supabase
    .from('newsletters')
    .update({ source_pdf_urls: filtered })
    .eq('id', newsletterId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Newsletterを公開
 *
 * @param newsletterId - 公開するNewsletterのUUID
 * @returns 更新後のNewsletterデータ
 */
export async function publishNewsletter(newsletterId: string): Promise<Newsletter> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  // まず公開対象のNewsletterを取得して parent_id を確認
  const { data: target, error: fetchError } = await supabase
    .from('newsletters')
    .select('*')
    .eq('id', newsletterId)
    .single();

  if (fetchError || !target) {
    throw fetchError || new Error('Newsletter not found');
  }

  // parent_id がある場合、元の公開版を archived に変更（タイトルに旧版を付与）
  if (target.parent_id) {
    const { data: parent } = await supabase
      .from('newsletters')
      .select('title')
      .eq('id', target.parent_id)
      .single();
    const archivedTitle = parent?.title && !parent.title.includes('(旧版)')
      ? `${parent.title} (旧版)`
      : parent?.title;
    await supabase
      .from('newsletters')
      .update({ status: 'archived', title: archivedTitle })
      .eq('id', target.parent_id);
    console.log(`📦 元の公開版をアーカイブ: ${target.parent_id}`);
  }

  const { data, error } = await supabase
    .from('newsletters')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      parent_id: null, // 公開後はparent_idをクリア
    })
    .eq('id', newsletterId)
    .select()
    .single();

  if (error) {
    console.error('❌ Newsletter公開エラー:', error);
    throw error;
  }

  console.log('✅ Newsletter公開完了:', newsletterId);
  return data;
}

/**
 * Newsletterを非公開（下書きに戻す）
 *
 * @param newsletterId - 非公開にするNewsletterのUUID
 * @returns 更新後のNewsletterデータ
 */
export async function unpublishNewsletter(newsletterId: string): Promise<Newsletter> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  const { data, error } = await supabase
    .from('newsletters')
    .update({
      status: 'draft',
      published_at: null,
    })
    .eq('id', newsletterId)
    .select()
    .single();

  if (error) {
    console.error('❌ Newsletter非公開エラー:', error);
    throw error;
  }

  console.log('✅ Newsletter非公開完了:', newsletterId);
  return data;
}

/**
 * 公開済みNewsletterの下書きコピーを作成
 *
 * 公開版はそのまま残し、編集用の下書きコピーを作成します。
 * 全記事もコピーされます。
 *
 * @param newsletterId - コピー元のNewsletter ID
 * @returns コピーされたNewsletterと記事
 */
export async function duplicateNewsletterAsDraft(
  newsletterId: string
): Promise<{ newsletter: Newsletter; articles: Article[] }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log('📋 Newsletter下書きコピーを作成中...', newsletterId);

  // 元のNewsletterを取得
  const { data: original, error: fetchError } = await supabase
    .from('newsletters')
    .select('*')
    .eq('id', newsletterId)
    .single();

  if (fetchError || !original) {
    throw fetchError || new Error('コピー元のNewsletterが見つかりません');
  }

  // Newsletterをコピー（新しいIDで、status: draft）
  const { data: copiedNewsletter, error: copyError } = await supabase
    .from('newsletters')
    .insert({
      organization_id: original.organization_id,
      title: original.title,
      issue_date: original.issue_date,
      source_pdf_url: original.source_pdf_url,
      source_pdf_urls: original.source_pdf_urls || [],
      status: 'draft',
      created_by: original.created_by,
      published_at: null,
      parent_id: newsletterId,
      digest_audio_url: original.digest_audio_url,
      digest_audio_filename: original.digest_audio_filename,
    })
    .select()
    .single();

  if (copyError || !copiedNewsletter) {
    throw copyError || new Error('Newsletterコピーに失敗しました');
  }

  console.log('✅ Newsletterコピー完了:', copiedNewsletter.id);

  // 元の記事を取得
  const { data: originalArticles, error: articlesError } = await supabase
    .from('articles')
    .select('*')
    .eq('newsletter_id', newsletterId)
    .order('display_order', { ascending: true });

  if (articlesError) {
    throw articlesError;
  }

  let copiedArticles: Article[] = [];

  if (originalArticles && originalArticles.length > 0) {
    // 記事をコピー（新しいnewsletter_idで）
    const articleCopies = originalArticles.map((article: any) => {
      const { id, newsletter_id, created_at, updated_at, ...rest } = article;
      return {
        ...rest,
        newsletter_id: copiedNewsletter.id,
      };
    });

    const { data: inserted, error: insertError } = await supabase
      .from('articles')
      .insert(articleCopies)
      .select();

    if (insertError) {
      throw insertError;
    }

    copiedArticles = inserted || [];
    console.log(`✅ ${copiedArticles.length}件の記事をコピーしました`);
  }

  return { newsletter: copiedNewsletter, articles: copiedArticles };
}
