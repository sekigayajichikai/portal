/**
 * Google Drive API（v3）をサービスアカウントで読む最小クライアント（ライブラリ不要）
 *
 * - サービスアカウントの鍵（JSON）で JWT を作り、アクセストークンに交換する（読み取り専用スコープ）
 * - フォルダの中身の一覧と、ファイルのダウンロードだけ
 *
 * 鍵は GitHub Secrets の GDRIVE_SA_KEY（JSON 文字列）から渡す。
 */
import { createSign } from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const API = 'https://www.googleapis.com/drive/v3';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** サービスアカウントの鍵からアクセストークンを得る（1時間有効） */
export async function getAccessToken(serviceAccountJson) {
  const key = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: key.token_uri, iat: now, exp: now + 3600 })
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = b64url(signer.sign(key.private_key));
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`Google のトークン取得に失敗: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token;
}

/** Drive の1ファイル（必要な項目だけ） */
export const FILE_FIELDS = 'id,name,mimeType,md5Checksum,modifiedTime,size';

/** フォルダ直下の一覧（ゴミ箱は除く。200件まで。ページ送りも対応） */
export async function listChildren(token, folderId) {
  const out = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      pageSize: '200',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      orderBy: 'name',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`${API}/files?${params}`, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Drive の一覧取得に失敗（フォルダ ${folderId}）: ${res.status} ${await res.text()}`);
    const json = await res.json();
    out.push(...(json.files ?? []));
    pageToken = json.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

/** ファイルの中身をダウンロードする（Buffer） */
export async function downloadFile(token, fileId) {
  const res = await fetch(`${API}/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive のダウンロードに失敗（${fileId}）: ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

export const isFolder = (f) => f.mimeType === 'application/vnd.google-apps.folder';
export const isPdf = (f) => f.mimeType === 'application/pdf' || /\.pdf$/i.test(f.name ?? '');
