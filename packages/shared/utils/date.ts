/**
 * 日付関連のユーティリティ関数
 */

/**
 * 現在時刻から指定した時刻までの分数を計算
 * @param timeString - 時刻文字列（"HH:mm"形式）
 * @returns 分数
 */
export function calculateMinutesUntil(timeString: string): number {
  if (!timeString) return 0;

  const now = new Date();
  const [hours, minutes] = timeString.split(':').map(Number);

  const targetTime = new Date();
  targetTime.setHours(hours, minutes, 0, 0);

  // 指定時刻が過去の場合は翌日とみなす
  if (targetTime <= now) {
    targetTime.setDate(targetTime.getDate() + 1);
  }

  const diff = targetTime.getTime() - now.getTime();
  return Math.floor(diff / (1000 * 60));
}

/**
 * 次のバス時刻を取得
 * @param times - バス時刻の配列（"HH:mm"形式）
 * @returns 次のバス時刻
 */
export function getNextBusTime(times: string[]): string {
  if (!times || times.length === 0) return '';

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // 現在時刻より後の最初の時刻を探す
  for (const time of times) {
    const [hours, minutes] = time.split(':').map(Number);
    if (hours > currentHour || (hours === currentHour && minutes > currentMinute)) {
      return time;
    }
  }

  // すべて過ぎていたら最初の時刻（翌日）を返す
  return times[0];
}

/**
 * 日付文字列をフォーマット
 * @param dateString - 日付文字列（"YYYY-MM-DD"形式）
 * @param format - フォーマット形式（"YYYY/MM/DD" | "MM月DD日" など）
 * @returns フォーマットされた日付文字列
 */
export function formatDate(dateString: string, format: 'slash' | 'japanese' = 'slash'): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  switch (format) {
    case 'slash':
      return `${year}/${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}`;
    case 'japanese':
      return `${month}月${day}日`;
    default:
      return dateString;
  }
}

/**
 * 曜日を取得
 * @param dateString - 日付文字列（"YYYY-MM-DD"形式）
 * @returns 曜日（"月" | "火" | "水" | "木" | "金" | "土" | "日"）
 */
export function getDayOfWeek(dateString: string): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return days[date.getDay()];
}

/**
 * 相対的な日付表現を取得
 * @param dateString - 日付文字列（"YYYY-MM-DD"形式）
 * @returns 相対的な日付表現（"今日" | "明日" | "MM月DD日" など）
 */
export function getRelativeDate(dateString: string): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  const diff = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diff === 0) return '今日';
  if (diff === 1) return '明日';
  if (diff === 2) return '明後日';
  if (diff === -1) return '昨日';

  return formatDate(dateString, 'japanese');
}
