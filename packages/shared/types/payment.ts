/**
 * 支払い・会費関連の型定義
 */

/**
 * 支払い情報（住民向け）
 */
export interface Payment {
  id: string;
  title: string;
  amount: number;
  status: 'paid' | 'unpaid';
  dueDate: string;
}

/**
 * 班別支払い統計（管理者向け）
 */
export interface GroupPaymentStats {
  groupName: string;
  paymentRate: number;
}
