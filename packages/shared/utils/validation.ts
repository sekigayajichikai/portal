/**
 * バリデーション関連のユーティリティ関数
 */

/**
 * メールアドレスの妥当性チェック
 * @param email - メールアドレス
 * @returns 妥当な場合true
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 電話番号の妥当性チェック
 * @param phoneNumber - 電話番号
 * @returns 妥当な場合true
 */
export function isValidPhoneNumber(phoneNumber: string): boolean {
  if (!phoneNumber) return false;

  // ハイフンを削除
  const cleaned = phoneNumber.replace(/-/g, '');

  // 10桁または11桁の数字
  return /^\d{10,11}$/.test(cleaned);
}

/**
 * 郵便番号の妥当性チェック
 * @param postalCode - 郵便番号
 * @returns 妥当な場合true
 */
export function isValidPostalCode(postalCode: string): boolean {
  if (!postalCode) return false;

  // ハイフンを削除
  const cleaned = postalCode.replace(/-/g, '');

  // 7桁の数字
  return /^\d{7}$/.test(cleaned);
}

/**
 * 空文字列またはundefined/nullかチェック
 * @param value - チェックする値
 * @returns 空の場合true
 */
export function isEmpty(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}

/**
 * 数値範囲内かチェック
 * @param value - チェックする値
 * @param min - 最小値
 * @param max - 最大値
 * @returns 範囲内の場合true
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}
