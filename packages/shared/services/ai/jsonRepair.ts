/**
 * 壊れかけのJSON文字列を修復する（AIレスポンス用）
 *
 * 文字列内のエスケープされていない引用符・改行・制御文字などを補正して
 * JSON.parse が通るようにする。Claude / Gemini 両方の抽出結果の解析で使う。
 */
export function repairJsonString(jsonStr: string): string {
  const result: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (escaped) {
      if (!'"\\/bfnrtu'.includes(char)) {
        // 不正なエスケープシーケンス → バックスラッシュをエスケープ
        result.push('\\');
      }
      result.push(char);
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      result.push(char);
      continue;
    }

    if (char === '"') {
      if (!inString) {
        inString = true;
        result.push(char);
      } else {
        // 文字列終端かどうかを後続文字で判定
        const rest = jsonStr.substring(i + 1).trimStart();
        const nextChar = rest[0];
        if (
          nextChar === undefined ||
          nextChar === ',' ||
          nextChar === '}' ||
          nextChar === ']' ||
          nextChar === ':'
        ) {
          // 文字列の終端
          inString = false;
          result.push(char);
        } else {
          // 文字列内のエスケープされていないダブルクォート
          result.push('\\"');
        }
      }
      continue;
    }

    // 文字列内のリテラル改行・タブをエスケープ
    if (inString) {
      if (char === '\n') { result.push('\\n'); continue; }
      if (char === '\r') { continue; }
      if (char === '\t') { result.push('\\t'); continue; }
      // 制御文字を除去
      if (char.charCodeAt(0) < 0x20) { continue; }
    }

    result.push(char);
  }

  return result.join('');
}

/**
 * 途中で切れた（出力上限に当たった）イベント抽出の JSON から、完全に書き終わっている要素だけを取り出す。
 * 例: {"events":[{...},{...},{"title":"途中で切れ  →  {"events":[{...},{...}]}
 * 使うのは JSON.parse と repairJsonString の両方が失敗したときだけ。取り出せなければ null。
 * @param jsonText - AI の返事（JSON 部分）
 * @returns 完全な要素だけの JSON 文字列。events 配列が見つからない・1件も完全でないときは null
 */
export function salvageTruncatedEventsJson(jsonText: string): string | null {
  const key = jsonText.indexOf('"events"');
  if (key < 0) return null;
  const start = jsonText.indexOf('[', key);
  if (start < 0) return null;

  const items: string[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let itemStart = -1;
  for (let i = start + 1; i < jsonText.length; i++) {
    const ch = jsonText[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') {
      if (depth === 0) itemStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && itemStart >= 0) {
        items.push(jsonText.slice(itemStart, i + 1));
        itemStart = -1;
      }
    } else if (ch === ']' && depth === 0) {
      break; // 配列が閉じている＝切れていない（別の原因）
    }
  }
  return items.length > 0 ? `{"events":[${items.join(',')}]}` : null;
}
