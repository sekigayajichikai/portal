/**
 * 管理画面用データサービス
 * 統計データ取得、データ更新ロジックを提供
 * 将来的なSupabase移行時はこのファイルのみ変更すればOKな疎結合な構造
 */
import { AdminStats, GroupPaymentStats, AdminNotice } from '@/types/types';

/**
 * 管理画面の統計データを取得
 */
export const getAdminStats = (): AdminStats => {
  // モックデータ - 将来的にはSupabaseから取得
  return {
    totalMembers: 124,
    memberChange: 2,
    circularReadRate: 87,
    unreadCirculars: 16,
    paymentRate: 92,
    unpaidHouseholds: 10,
    urgentItems: 3,
  };
};

/**
 * 班ごとの会費納入率データを取得
 */
export const getGroupPaymentStats = (): GroupPaymentStats[] => {
  // モックデータ - 将来的にはSupabaseから取得
  return [
    { groupName: '1班', paymentRate: 85 },
    { groupName: '2班', paymentRate: 95 },
    { groupName: '3班', paymentRate: 65 },
    { groupName: '4班', paymentRate: 98 },
    { groupName: '5班', paymentRate: 78 },
  ];
};

/**
 * 最新のお知らせデータを取得
 */
export const getRecentNotices = (): AdminNotice[] => {
  // モックデータ - 将来的にはSupabaseから取得
  return [
    { id: 'n1', type: 'Event', title: '夏祭り実行委員会の招集', date: '2024-07-20' },
    { id: 'n2', type: 'Notice', title: 'ゴミステーションの清掃について', date: '2024-07-18' },
  ];
};

