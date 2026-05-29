/**
 * Google Apps Script: Google Drive → Supabase 自動同期
 *
 * 指定フォルダ内のサブフォルダ（YYYYMM形式）ごとにPDFを取得し、
 * 対応するNewsletter（YYYY年M月号）に自動登録する。
 *
 * フォルダ構成:
 *   指定フォルダ/
 *   ├── 202604/       ← 2026年4月号に登録
 *   │   ├── 福祉よこはま.pdf
 *   │   └── 防犯だより.pdf
 *   ├── 202605/       ← 2026年5月号に登録
 *   │   └── にしかぜ.pdf
 *
 * 【設定手順】
 * 1. https://script.google.com にアクセス
 * 2. 「新しいプロジェクト」を作成
 * 3. このコードを貼り付け
 * 4. 下の「設定値」を自分の環境に合わせて変更
 * 5. 「実行」→「testConnection」で接続テスト
 * 6. 「実行」→「syncDrivePdfs」で手動同期
 * 7. 「トリガー」→「トリガーを追加」→ syncDrivePdfs を5分おきに自動実行
 */

// ====== 設定値 ======
const CONFIG = {
  // Google DriveのフォルダID（URLの最後の部分）
  DRIVE_FOLDER_ID: '1-gMwA75RfpMfxuKiPZmxhOhjK8OFq-H_',

  // Supabase設定
  SUPABASE_URL: 'https://ktxofualnuisijissvif.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0eG9mdWFsbnVpc2lqaXNzdmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4Mzk0NjQsImV4cCI6MjA4NDQxNTQ2NH0.8Yp2DLP0TRP-7-rOVaBGCbJg09LZn13g2IwfevsxYRk',

  // Storageバケット名
  STORAGE_BUCKET: 'newsletters',
};
// ====================

/**
 * メイン処理：サブフォルダ（YYYYMM）ごとにPDFを同期
 */
function syncDrivePdfs() {
  const parentFolder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const subFolders = parentFolder.getFolders();

  const props = PropertiesService.getScriptProperties();
  const processedIds = JSON.parse(props.getProperty('processedFileIds') || '[]');

  let totalNew = 0;

  while (subFolders.hasNext()) {
    const subFolder = subFolders.next();
    const folderName = subFolder.getName();

    // YYYYMM形式かチェック
    const match = folderName.match(/^(\d{4})(\d{2})$/);
    if (!match) {
      Logger.log(`⏭️ スキップ（YYYYMM形式でない）: ${folderName}`);
      continue;
    }

    const year = parseInt(match[1]);
    const month = parseInt(match[2]);
    const newsletterTitle = `${year}年${month}月号`;

    Logger.log(`📁 フォルダ: ${folderName} → ${newsletterTitle}`);

    // 対応するNewsletterを検索（なければ自動作成）
    let newsletter = findNewsletterByTitle(newsletterTitle);
    if (!newsletter) {
      Logger.log(`📝 Newsletterを自動作成: ${newsletterTitle}`);
      newsletter = createNewsletter(newsletterTitle, year, month);
      if (!newsletter) {
        Logger.log(`❌ Newsletter作成に失敗しました: ${newsletterTitle}`);
        continue;
      }
    }

    // フォルダ内のPDFを処理
    const files = subFolder.getFilesByType('application/pdf');
    while (files.hasNext()) {
      const file = files.next();
      const fileId = file.getId();

      if (processedIds.includes(fileId)) continue;

      // ファイル名で重複チェック
      const label = file.getName().replace(/\.pdf$/i, '');
      const existingUrls = newsletter.source_pdf_urls || [];
      const alreadyExists = existingUrls.some(function(entry) {
        const entryLabel = typeof entry === 'string' ? '' : (entry.label || '');
        return entryLabel === label;
      });

      if (alreadyExists) {
        Logger.log(`⏭️ 既に登録済み: ${file.getName()}`);
        processedIds.push(fileId);
        continue;
      }

      try {
        // Supabase Storageにアップロード
        const uploadResult = uploadToSupabase(file, year, month);
        if (!uploadResult) continue;

        // Newsletterに追加
        addPdfToNewsletter(newsletter.id, uploadResult.url, label, existingUrls);

        // existingUrlsを更新（同じループ内で次のファイルが重複しないように）
        existingUrls.push({ url: uploadResult.url, label: label, publisher: '', type: 'attachment', thumbnail: '' });

        processedIds.push(fileId);
        totalNew++;

        Logger.log(`✅ ${newsletterTitle}に追加: ${file.getName()}`);
      } catch (error) {
        Logger.log(`❌ エラー: ${file.getName()} - ${error.message}`);
      }
    }
  }

  // 親フォルダ直下のPDF（サブフォルダに入っていないもの）も処理
  const rootFiles = parentFolder.getFilesByType('application/pdf');
  while (rootFiles.hasNext()) {
    const file = rootFiles.next();
    const fileId = file.getId();

    if (processedIds.includes(fileId)) continue;

    try {
      Logger.log(`📄 未分類PDF: ${file.getName()}`);

      // Storageにアップロード（年月はupload時点の日付を使用）
      const now = new Date();
      const uploadResult = uploadToSupabase(file, now.getFullYear(), now.getMonth() + 1);
      if (!uploadResult) continue;

      // 「未分類」Newsletterに追加（なければ作成）
      const unclassifiedTitle = '未分類PDF';
      let unclassified = findNewsletterByTitle(unclassifiedTitle);
      if (!unclassified) {
        unclassified = createNewsletter(unclassifiedTitle, now.getFullYear(), now.getMonth() + 1);
      }
      if (unclassified) {
        const label = file.getName().replace(/\.pdf$/i, '');
        const existingUrls = unclassified.source_pdf_urls || [];

        // 重複チェック
        const alreadyExists = existingUrls.some(function(entry) {
          return (typeof entry === 'string' ? '' : (entry.label || '')) === label;
        });

        if (!alreadyExists) {
          addPdfToNewsletter(unclassified.id, uploadResult.url, label, existingUrls);
          totalNew++;
          Logger.log(`✅ 未分類に追加: ${file.getName()}`);
        }
      }

      processedIds.push(fileId);
    } catch (error) {
      Logger.log(`❌ エラー: ${file.getName()} - ${error.message}`);
    }
  }

  props.setProperty('processedFileIds', JSON.stringify(processedIds));
  Logger.log(`🎉 同期完了: ${totalNew}件の新しいPDFをアップロードしました`);
}

/**
 * タイトルでNewsletterを検索（例: "2026年5月号"）
 */
function findNewsletterByTitle(title) {
  const response = UrlFetchApp.fetch(
    `${CONFIG.SUPABASE_URL}/rest/v1/newsletters?title=eq.${encodeURIComponent(title)}&limit=1`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      muteHttpExceptions: true,
    }
  );

  const data = JSON.parse(response.getContentText());
  return data.length > 0 ? data[0] : null;
}

/**
 * PDFをSupabase Storageにアップロード
 */
function uploadToSupabase(file, year, month) {
  const monthStr = String(month).padStart(2, '0');
  const timestamp = Date.now();
  const safeName = file.getName().replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
  const path = `${year}/${monthStr}/drive-${safeName}-${timestamp}.pdf`;

  const blob = file.getBlob();
  const bytes = blob.getBytes();

  const response = UrlFetchApp.fetch(
    `${CONFIG.SUPABASE_URL}/storage/v1/object/${CONFIG.STORAGE_BUCKET}/${path}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Content-Type': 'application/pdf',
      },
      payload: bytes,
      muteHttpExceptions: true,
    }
  );

  if (response.getResponseCode() !== 200) {
    Logger.log(`⚠️ アップロード失敗: ${response.getContentText()}`);
    return null;
  }

  const publicUrl = `${CONFIG.SUPABASE_URL}/storage/v1/object/public/${CONFIG.STORAGE_BUCKET}/${path}`;
  return { url: publicUrl, path: path };
}

/**
 * NewsletterのsourcePdfUrlsにPDFを追加
 */
function addPdfToNewsletter(newsletterId, pdfUrl, label, existingUrls) {
  const normalized = existingUrls.map(function(entry) {
    return typeof entry === 'string' ? { url: entry, label: '' } : entry;
  });

  normalized.push({
    url: pdfUrl,
    label: label,
    publisher: '',
    type: 'attachment',
    thumbnail: 'pending',
  });

  const response = UrlFetchApp.fetch(
    `${CONFIG.SUPABASE_URL}/rest/v1/newsletters?id=eq.${newsletterId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      payload: JSON.stringify({
        source_pdf_urls: normalized,
      }),
      muteHttpExceptions: true,
    }
  );

  if (response.getResponseCode() !== 204) {
    Logger.log(`⚠️ Newsletter更新失敗: ${response.getContentText()}`);
  }
}

/**
 * Newsletterを自動作成（下書き状態）
 */
function createNewsletter(title, year, month) {
  const monthStr = String(month).padStart(2, '0');
  const issueDate = `${year}-${monthStr}-01`;

  const response = UrlFetchApp.fetch(
    `${CONFIG.SUPABASE_URL}/rest/v1/newsletters`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      payload: JSON.stringify({
        title: title,
        issue_date: issueDate,
        status: 'draft',
        source_pdf_url: null,
        source_pdf_urls: [],
        parent_id: null,
        organization_id: null,
        created_by: null,
        published_at: null,
      }),
      muteHttpExceptions: true,
    }
  );

  if (response.getResponseCode() !== 201) {
    Logger.log(`⚠️ Newsletter作成失敗: ${response.getContentText()}`);
    return null;
  }

  const data = JSON.parse(response.getContentText());
  Logger.log(`✅ Newsletter作成完了: ${title} (ID: ${data[0].id})`);
  return data[0];
}

/**
 * 処理済みリストをリセット（全ファイルを再処理したい場合）
 */
function resetProcessedFiles() {
  PropertiesService.getScriptProperties().deleteProperty('processedFileIds');
  Logger.log('✅ 処理済みリストをリセットしました');
}

/**
 * テスト：接続とフォルダ構成を確認
 */
function testConnection() {
  // フォルダ確認
  try {
    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    Logger.log(`✅ 親フォルダ: ${folder.getName()}`);

    const subFolders = folder.getFolders();
    while (subFolders.hasNext()) {
      const sub = subFolders.next();
      const name = sub.getName();
      const match = name.match(/^(\d{4})(\d{2})$/);

      const files = sub.getFilesByType('application/pdf');
      let count = 0;
      while (files.hasNext()) { files.next(); count++; }

      if (match) {
        const title = `${parseInt(match[1])}年${parseInt(match[2])}月号`;
        const newsletter = findNewsletterByTitle(title);
        Logger.log(`  📁 ${name} → ${title} ${newsletter ? '✅ Newsletter存在' : '❌ Newsletter未作成'} (PDF: ${count}件)`);
      } else {
        Logger.log(`  📁 ${name} ⏭️ スキップ（YYYYMM形式でない） (PDF: ${count}件)`);
      }
    }
  } catch (e) {
    Logger.log(`❌ フォルダアクセスエラー: ${e.message}`);
  }
}
