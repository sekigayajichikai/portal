/**
 * フォーマット関連のユーティリティ関数
 */

/**
 * 金額をフォーマット
 * @param amount - 金額
 * @param includeCurrency - 通貨記号を含めるか
 * @returns フォーマットされた金額文字列
 */
export function formatCurrency(amount: number, includeCurrency = true): string {
  const formatted = amount.toLocaleString('ja-JP');
  return includeCurrency ? `¥${formatted}` : formatted;
}

/**
 * パーセンテージをフォーマット
 * @param value - 値（0-100）
 * @param decimals - 小数点以下の桁数
 * @returns フォーマットされたパーセンテージ文字列
 */
export function formatPercentage(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * 電話番号をフォーマット
 * @param phoneNumber - 電話番号
 * @returns フォーマットされた電話番号
 */
export function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) return '';

  // ハイフンを削除
  const cleaned = phoneNumber.replace(/-/g, '');

  // 携帯電話（090, 080, 070で始まる11桁）
  if (/^(090|080|070)\d{8}$/.test(cleaned)) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
  }

  // 固定電話（市外局番を考慮）
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }

  return phoneNumber;
}

/**
 * 住所をフォーマット
 * @param address - 住所
 * @param prefix - プレフィックス（例: "〒"）
 * @returns フォーマットされた住所
 */
export function formatAddress(address: string, prefix = ''): string {
  if (!address) return '';
  return prefix ? `${prefix}${address}` : address;
}

/**
 * 名前をイニシャル化
 * @param name - 名前
 * @returns イニシャル
 */
export function getInitials(name: string): string {
  if (!name) return '';

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/**
 * テキストを省略
 * @param text - テキスト
 * @param maxLength - 最大長
 * @param ellipsis - 省略記号
 * @returns 省略されたテキスト
 */
export function truncateText(text: string, maxLength: number, ellipsis = '...'): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength - ellipsis.length) + ellipsis;
}
