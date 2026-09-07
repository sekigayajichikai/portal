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
