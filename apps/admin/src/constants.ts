import { Member, Circular, BusSchedule, GarbageRule } from "@shared/types";

export const MOCK_MEMBERS: Member[] = [
  { id: '1', name: '田中 健一', address: '1-2-3', group: '1班', phone: '090-1234-5678', hasPaidFee: true, hasReadLatestCircular: true, role: 'leader' },
  { id: '2', name: '鈴木 花子', address: '1-2-4', group: '1班', phone: '090-8765-4321', hasPaidFee: true, hasReadLatestCircular: false, role: 'member' },
  { id: '3', name: '佐藤 次郎', address: '2-5-1', group: '2班', phone: '080-1111-2222', hasPaidFee: false, hasReadLatestCircular: true, role: 'member' },
  { id: '4', name: '山田 太郎', address: '3-1-1', group: '3班', phone: '070-9999-8888', hasPaidFee: true, hasReadLatestCircular: true, role: 'admin' },
  { id: '5', name: '高橋 優子', address: '3-1-2', group: '3班', phone: '090-5555-6666', hasPaidFee: false, hasReadLatestCircular: false, role: 'member' },
];

export const MOCK_CIRCULARS: Circular[] = [
  {
    id: 'c1',
    title: '夏祭りの開催について',
    content: '今年の夏祭りは8月15日(土)に開催されます。午後5時から公民館前の広場にて行います。屋台や盆踊りがありますので、ご家族揃ってご参加ください。お手伝いいただける方も募集しています。',
    date: '2024-07-20',
    category: 'event',
    author: '実行委員会',
    readCount: 45,
    totalTarget: 120,
  },
  {
    id: 'c2',
    title: '資源ごみ回収日の変更',
    content: '来月から資源ごみの回収日が第2水曜日から第2木曜日に変更になります。お間違えのないようにお願いいたします。',
    date: '2024-08-01',
    category: 'notice',
    author: '環境部',
    readCount: 110,
    totalTarget: 120,
  },
];

export const MOCK_BUS_SCHEDULE: BusSchedule[] = [
  { id: 'b1', route: '駅方面', stopName: '自治会館前', times: ['07:15', '08:45', '10:30', '13:00', '16:45', '18:30'] },
  { id: 'b2', route: '市民病院方面', stopName: '中央公園', times: ['09:00', '11:00', '14:00', '16:00'] },
];

export const MOCK_GARBAGE_RULES: GarbageRule[] = [
  { id: 'g1', type: '燃えるゴミ', dayOfWeek: '月・木', icon: '🔥', description: '朝8時までに出してください。' },
  { id: 'g2', type: 'プラスチック', dayOfWeek: '火', icon: '🥤', description: '洗ってから出してください。' },
  { id: 'g3', type: 'ビン・カン', dayOfWeek: '第1・3水', icon: '🥫', description: 'カゴに分別して入れてください。' },
];
