/**
 * バス時刻表サービス
 *
 * バス時刻表のCRUD操作を提供します。
 *
 * @module services/busScheduleService
 */

import { getSupabaseClient } from './supabaseClient.js';
import type { BusSchedule } from '../types/index.js';

/**
 * バス時刻表を保存
 *
 * 新しいバス時刻表をデータベースに保存します。
 *
 * @param schedule - 保存するバス時刻表データ
 * @returns 保存されたバス時刻表（IDを含む）
 * @throws 保存に失敗した場合
 */
export async function saveBusSchedule(
  schedule: Omit<BusSchedule, 'id' | 'createdAt' | 'updatedAt'>
): Promise<BusSchedule> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabaseが設定されていません');
  }

  const { data, error } = await supabase
    .from('bus_schedules')
    .insert([
      {
        organization_id: schedule.organizationId,
        route_name: schedule.routeName,
        stop_name: schedule.stopName,
        destination: schedule.destination,
        schedule_data: schedule.scheduleData,
        source_pdf_url: schedule.sourcePdfUrl,
        valid_from: schedule.validFrom,
        valid_until: schedule.validUntil,
        notes: schedule.notes,
        display_order: schedule.displayOrder,
        is_active: schedule.isActive,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('バス時刻表の保存に失敗しました:', error);
    throw new Error(`バス時刻表の保存に失敗しました: ${error.message}`);
  }

  return convertFromDatabase(data);
}

/**
 * バス時刻表を一括保存
 *
 * 複数のバス時刻表を一度にデータベースに保存します。
 *
 * @param schedules - 保存するバス時刻表の配列
 * @returns 保存されたバス時刻表の配列
 * @throws 保存に失敗した場合
 */
export async function saveBusSchedules(
  schedules: Omit<BusSchedule, 'id' | 'createdAt' | 'updatedAt'>[]
): Promise<BusSchedule[]> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabaseが設定されていません');
  }

  const records = schedules.map((schedule) => ({
    organization_id: schedule.organizationId,
    route_name: schedule.routeName,
    stop_name: schedule.stopName,
    destination: schedule.destination,
    schedule_data: schedule.scheduleData,
    source_pdf_url: schedule.sourcePdfUrl,
    valid_from: schedule.validFrom,
    valid_until: schedule.validUntil,
    notes: schedule.notes,
    display_order: schedule.displayOrder,
    is_active: schedule.isActive,
  }));

  const { data, error } = await supabase
    .from('bus_schedules')
    .insert(records)
    .select();

  if (error) {
    console.error('バス時刻表の一括保存に失敗しました:', error);
    throw new Error(`バス時刻表の一括保存に失敗しました: ${error.message}`);
  }

  return data.map(convertFromDatabase);
}

/**
 * バス時刻表を取得
 *
 * アクティブなバス時刻表を表示順でソートして取得します。
 *
 * @param organizationId - オプション。組織IDで絞り込み
 * @returns バス時刻表の配列
 * @throws 取得に失敗した場合
 */
export async function fetchBusSchedules(
  organizationId?: string
): Promise<BusSchedule[]> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    console.warn('Supabaseが設定されていません。空の配列を返します。');
    return [];
  }

  let query = supabase
    .from('bus_schedules')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('バス時刻表の取得に失敗しました:', error);
    throw new Error(`バス時刻表の取得に失敗しました: ${error.message}`);
  }

  return (data || []).map(convertFromDatabase);
}

/**
 * 全てのバス時刻表を取得（管理画面用）
 *
 * アクティブ/非アクティブ問わず全てのバス時刻表を取得します。
 *
 * @param organizationId - オプション。組織IDで絞り込み
 * @returns バス時刻表の配列
 * @throws 取得に失敗した場合
 */
export async function fetchAllBusSchedules(
  organizationId?: string
): Promise<BusSchedule[]> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    console.warn('Supabaseが設定されていません。空の配列を返します。');
    return [];
  }

  let query = supabase
    .from('bus_schedules')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('バス時刻表の取得に失敗しました:', error);
    throw new Error(`バス時刻表の取得に失敗しました: ${error.message}`);
  }

  return (data || []).map(convertFromDatabase);
}

/**
 * バス時刻表を更新
 *
 * 指定されたIDのバス時刻表を更新します。
 *
 * @param id - 更新するバス時刻表のID
 * @param updates - 更新する内容
 * @returns 更新されたバス時刻表
 * @throws 更新に失敗した場合
 */
export async function updateBusSchedule(
  id: string,
  updates: Partial<Omit<BusSchedule, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<BusSchedule> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabaseが設定されていません');
  }

  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.organizationId !== undefined) updateData.organization_id = updates.organizationId;
  if (updates.routeName !== undefined) updateData.route_name = updates.routeName;
  if (updates.stopName !== undefined) updateData.stop_name = updates.stopName;
  if (updates.destination !== undefined) updateData.destination = updates.destination;
  if (updates.scheduleData !== undefined) updateData.schedule_data = updates.scheduleData;
  if (updates.sourcePdfUrl !== undefined) updateData.source_pdf_url = updates.sourcePdfUrl;
  if (updates.validFrom !== undefined) updateData.valid_from = updates.validFrom;
  if (updates.validUntil !== undefined) updateData.valid_until = updates.validUntil;
  if (updates.notes !== undefined) updateData.notes = updates.notes;
  if (updates.displayOrder !== undefined) updateData.display_order = updates.displayOrder;
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

  const { data, error } = await supabase
    .from('bus_schedules')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('バス時刻表の更新に失敗しました:', error);
    throw new Error(`バス時刻表の更新に失敗しました: ${error.message}`);
  }

  return convertFromDatabase(data);
}

/**
 * バス時刻表を削除
 *
 * 指定されたIDのバス時刻表を削除します。
 * 実際には is_active を false にする論理削除を行います。
 *
 * @param id - 削除するバス時刻表のID
 * @throws 削除に失敗した場合
 */
export async function deleteBusSchedule(id: string): Promise<void> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabaseが設定されていません');
  }

  const { error } = await supabase
    .from('bus_schedules')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('バス時刻表の削除に失敗しました:', error);
    throw new Error(`バス時刻表の削除に失敗しました: ${error.message}`);
  }
}

/**
 * バス時刻表を完全に削除
 *
 * 指定されたIDのバス時刻表をデータベースから完全に削除します。
 * 通常は deleteBusSchedule（論理削除）を使用してください。
 *
 * @param id - 削除するバス時刻表のID
 * @throws 削除に失敗した場合
 */
export async function permanentlyDeleteBusSchedule(id: string): Promise<void> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabaseが設定されていません');
  }

  const { error } = await supabase.from('bus_schedules').delete().eq('id', id);

  if (error) {
    console.error('バス時刻表の完全削除に失敗しました:', error);
    throw new Error(`バス時刻表の完全削除に失敗しました: ${error.message}`);
  }
}

/**
 * バス時刻表の表示順序を一括更新
 *
 * 複数のバス時刻表の表示順序を一度に更新します。
 * ドラッグ&ドロップなどで順序を変更した際に使用します。
 *
 * @param updates - 更新する配列 [{ scheduleId: string, displayOrder: number }, ...]
 * @throws 更新に失敗した場合
 *
 * @example
 * await bulkUpdateBusScheduleOrder([
 *   { scheduleId: 'schedule-1', displayOrder: 0 },
 *   { scheduleId: 'schedule-2', displayOrder: 1 },
 *   { scheduleId: 'schedule-3', displayOrder: 2 }
 * ]);
 */
export async function bulkUpdateBusScheduleOrder(
  updates: Array<{ scheduleId: string; displayOrder: number }>
): Promise<void> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabaseが設定されていません');
  }

  // 各スケジュールの表示順序を更新
  for (const { scheduleId, displayOrder } of updates) {
    const { error } = await supabase
      .from('bus_schedules')
      .update({
        display_order: displayOrder,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scheduleId);

    if (error) {
      console.error('バス時刻表の順序更新に失敗しました:', error);
      throw new Error(`バス時刻表の順序更新に失敗しました: ${error.message}`);
    }
  }
}

/**
 * データベースのレコードをBusSchedule型に変換
 *
 * @param record - データベースから取得したレコード
 * @returns BusSchedule型のオブジェクト
 */
function convertFromDatabase(record: any): BusSchedule {
  return {
    id: record.id,
    organizationId: record.organization_id,
    routeName: record.route_name,
    stopName: record.stop_name,
    destination: record.destination,
    scheduleData: record.schedule_data,
    sourcePdfUrl: record.source_pdf_url,
    validFrom: record.valid_from,
    validUntil: record.valid_until,
    notes: record.notes,
    displayOrder: record.display_order,
    isActive: record.is_active,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}
