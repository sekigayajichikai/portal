/**
 * 発行元マスター管理サービス
 *
 * 2026-10-01 に主催団体と一本化したので、実体は団体マスタ（organizers）の
 * 「発行元として使う」団体。publishers テーブルはもう読まない（後日削除予定）。
 * 回覧板の作成画面などが使っている形（Publisher）はそのまま保っている。
 */

import {
  addOrganizer,
  getOrganizersSafe,
  type Organizer,
} from './organizerService.js';

export interface Publisher {
  id: string;
  organization_id: string | null;
  name: string;
  short_name: string | null;
  display_order: number;
  created_at: string;
}

function toPublisher(o: Organizer): Publisher {
  return {
    id: o.id,
    organization_id: o.organization_id,
    name: o.name,
    short_name: o.short_name,
    display_order: o.display_order,
    created_at: o.created_at,
  };
}

/** 発行元一覧を取得（表示順） */
export async function getPublishers(): Promise<Publisher[]> {
  const organizers = await getOrganizersSafe();
  return organizers.filter((o) => o.use_as_publisher).map(toPublisher);
}

/** 発行元を追加（団体マスタに「発行元として使う」で登録する） */
export async function addPublisher(name: string, shortName?: string, displayOrder?: number): Promise<Publisher> {
  const created = await addOrganizer(name, shortName, displayOrder, { useAsPublisher: true });
  return toPublisher(created);
}

/** 発行元名の一覧を取得（AI用：名前だけの配列） */
export async function getPublisherNames(): Promise<string[]> {
  const publishers = await getPublishers();
  return publishers.map((p) => p.name);
}
