/**
 * モックデータ
 * 開発・テスト用のサンプルデータ
 */

import {
  Member,
  User,
  Circular,
  CircularForResident,
  Event,
  BusSchedule,
  BusScheduleForResident,
  GarbageRule,
  GarbageInfo,
  Payment,
  Newsletter,
  Article,
  Category,
} from '../types/index.js';

// ========================================
// 会員データ
// ========================================

/**
 * モック会員データ（管理者向け）
 */
export const MOCK_MEMBERS: Member[] = [
  {
    id: '1',
    name: '田中 健一',
    address: '1-2-3',
    group: '1班',
    phone: '090-1234-5678',
    hasPaidFee: true,
    hasReadLatestCircular: true,
    role: 'leader',
  },
  {
    id: '2',
    name: '鈴木 花子',
    address: '1-2-4',
    group: '1班',
    phone: '090-8765-4321',
    hasPaidFee: true,
    hasReadLatestCircular: false,
    role: 'member',
  },
  {
    id: '3',
    name: '佐藤 次郎',
    address: '2-5-1',
    group: '2班',
    phone: '080-1111-2222',
    hasPaidFee: false,
    hasReadLatestCircular: true,
    role: 'member',
  },
  {
    id: '4',
    name: '山田 太郎',
    address: '3-1-1',
    group: '3班',
    phone: '070-9999-8888',
    hasPaidFee: true,
    hasReadLatestCircular: true,
    role: 'admin',
  },
  {
    id: '5',
    name: '高橋 優子',
    address: '3-1-2',
    group: '3班',
    phone: '090-5555-6666',
    hasPaidFee: false,
    hasReadLatestCircular: false,
    role: 'member',
  },
];

/**
 * モックユーザー（住民向け）
 */
export const MOCK_USER: User = {
  id: 'u1',
  name: '山田 太郎',
  avatar: 'https://picsum.photos/seed/user/100/100',
  group: '3班',
};

// ========================================
// 回覧板データ
// ========================================

/**
 * モック回覧板データ（管理者向け）
 */
export const MOCK_CIRCULARS: Circular[] = [
  {
    id: 'c1',
    title: '夏祭りの開催について',
    content:
      '今年の夏祭りは8月15日(土)に開催されます。午後5時から公民館前の広場にて行います。屋台や盆踊りがありますので、ご家族揃ってご参加ください。お手伝いいただける方も募集しています。',
    date: '2024-07-20',
    category: 'event',
    author: '実行委員会',
    readCount: 45,
    totalTarget: 120,
  },
  {
    id: 'c2',
    title: '資源ごみ回収日の変更',
    content:
      '来月から資源ごみの回収日が第2水曜日から第2木曜日に変更になります。お間違えのないようにお願いいたします。',
    date: '2024-08-01',
    category: 'notice',
    author: '環境部',
    readCount: 110,
    totalTarget: 120,
  },
];

/**
 * モック回覧板データ（住民向け）
 */
export const MOCK_CIRCULARS_FOR_RESIDENT: CircularForResident[] = [
  {
    id: 'c1',
    title: '夏祭りのボランティア募集について',
    date: '2024-05-18',
    content: '今年の夏祭りの運営をお手伝いいただける方を募集しています。詳細は公民館まで。',
    isRead: false,
    groupReadRate: 45,
  },
  {
    id: 'c2',
    title: '不審者情報にご注意ください',
    date: '2024-05-15',
    content: '先週、中央公園付近で不審者が目撃されました。夜間の一人歩きは避けてください。',
    isRead: true,
    groupReadRate: 88,
  },
  {
    id: 'c3',
    title: '資源ごみ回収場所の変更',
    date: '2024-05-10',
    content: '来月より資源ごみの回収場所が南公園横に変更になります。',
    isRead: true,
    groupReadRate: 95,
  },
];

// ========================================
// イベントデータ
// ========================================

/**
 * モックイベントデータ（住民向け）
 */
export const MOCK_EVENTS: Event[] = [
  {
    id: 'e1',
    title: '夕暮れパークヨガ',
    date: '2024-05-24',
    time: '17:30',
    location: '中央公園',
    category: 'sports',
    image: 'https://picsum.photos/seed/yoga/400/250',
  },
  {
    id: 'e2',
    title: '地ビール祭り',
    date: '2024-06-01',
    time: '12:00',
    location: '交流センター前',
    category: 'festival',
    image: 'https://picsum.photos/seed/beer/400/250',
  },
  {
    id: 'e3',
    title: '若手クリエイター市',
    date: '2024-06-08',
    time: '10:00',
    location: '自治会館ホール',
    category: 'workshop',
    image: 'https://picsum.photos/seed/craft/400/250',
  },
];

// ========================================
// バススケジュールデータ
// ========================================

/**
 * モックバススケジュール（管理者向け）
 */
export const MOCK_BUS_SCHEDULE: BusSchedule[] = [
  {
    id: 'b1',
    route: '駅方面',
    stopName: '自治会館前',
    times: ['07:15', '08:45', '10:30', '13:00', '16:45', '18:30'],
  },
  {
    id: 'b2',
    route: '市民病院方面',
    stopName: '中央公園',
    times: ['09:00', '11:00', '14:00', '16:00'],
  },
];

/**
 * モックバススケジュール（住民向け）
 */
export const MOCK_BUS_SCHEDULES_FOR_RESIDENT: BusScheduleForResident[] = [
  {
    id: '1',
    route: '21番',
    destination: '中央駅前',
    times: [
      '08:05',
      '08:25',
      '08:45',
      '09:05',
      '10:15',
      '12:00',
      '14:30',
      '17:15',
      '18:15',
      '19:15',
      '20:15',
      '21:05',
    ],
  },
  {
    id: '2',
    route: '空港線',
    destination: '国際空港',
    times: ['07:10', '08:10', '09:10', '11:10', '13:10', '15:10', '17:10', '19:10'],
  },
];

// ========================================
// ゴミ収集データ
// ========================================

/**
 * モックゴミ収集ルール（管理者向け）
 */
export const MOCK_GARBAGE_RULES: GarbageRule[] = [
  {
    id: 'g1',
    type: '燃えるゴミ',
    dayOfWeek: '月・木',
    icon: '🔥',
    description: '朝8時までに出してください。',
  },
  {
    id: 'g2',
    type: 'プラスチック',
    dayOfWeek: '火',
    icon: '🥤',
    description: '洗ってから出してください。',
  },
  {
    id: 'g3',
    type: 'ビン・カン',
    dayOfWeek: '第1・3水',
    icon: '🥫',
    description: 'カゴに分別して入れてください。',
  },
];

/**
 * モックゴミ収集情報（住民向け）
 */
export const MOCK_GARBAGE_INFO: GarbageInfo[] = [
  {
    type: '可燃ごみ',
    icon: '🔥',
    color: 'bg-rose-400',
    nextDate: '2024-05-21',
    description: '生ごみ、紙くずなど',
  },
  {
    type: '資源ごみ',
    icon: '♻️',
    color: 'bg-emerald-400',
    nextDate: '2024-05-22',
    description: 'ペットボトル、缶、ビン',
  },
  {
    type: '不燃ごみ',
    icon: '🔨',
    color: 'bg-indigo-400',
    nextDate: '2024-05-25',
    description: '金属、陶器、プラスチック',
  },
];

// ========================================
// 支払いデータ
// ========================================

/**
 * モック支払いデータ（住民向け）
 */
export const MOCK_PAYMENTS: Payment[] = [
  {
    id: 'p1',
    title: '2024年度 前期自治会費',
    amount: 3000,
    status: 'unpaid',
    dueDate: '2024-06-30',
  },
];

// ========================================
// 広報誌・記事データ
// ========================================

/**
 * モック広報誌データ
 */
export const MOCK_NEWSLETTERS: Newsletter[] = [
  {
    id: 'n1',
    organization_id: 'org1',
    title: '2025年1月号',
    issue_date: '2025-01-01',
    source_pdf_url: null,
    status: 'published',
    created_by: 'admin1',
    created_at: '2025-01-01T00:00:00Z',
    published_at: '2025-01-01T10:00:00Z',
  },
  {
    id: 'n2',
    organization_id: 'org1',
    title: '2024年12月号',
    issue_date: '2024-12-01',
    source_pdf_url: null,
    status: 'published',
    created_by: 'admin1',
    created_at: '2024-12-01T00:00:00Z',
    published_at: '2024-12-01T10:00:00Z',
  },
];

/**
 * モック記事データ
 */
export const MOCK_ARTICLES: Article[] = [
  {
    id: 'a1',
    newsletter_id: 'n1',
    organization_id: 'org1',
    title: 'どんど焼き開催のお知らせ',
    category: 'event',
    priority: 'high',
    deadline: '2025-01-10',
    headline: 'どんど焼き',
    brief: '1/10どんど焼き開催',
    summary: '1月10日（土）11時～奥座公園でどんど焼き。お焚き上げ、豚汁振る舞い、餅つき体験',
    content:
      '令和7年1月10日（土）午前11時より、奥座公園にてどんど焼きを開催します。正月飾りやお札のお焚き上げを行います。また、豚汁の無料振る舞いと餅つき体験もございますので、ご家族揃ってお越しください。',
    tags: ['正月', 'イベント', '奥座公園'],
    visibility: 'public',
    source: '関ヶ谷だより',
    attachments: [],
    display_order: 1,
    is_pinned: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'a2',
    newsletter_id: 'n1',
    organization_id: 'org1',
    title: '会館の臨時休館について',
    category: 'notice',
    priority: 'high',
    deadline: '2025-01-15',
    headline: '会館休館',
    brief: '1/15-17会館休館',
    summary: '1月15日～17日、設備点検のため会館を臨時休館します',
    content:
      '自治会館は設備点検のため、1月15日（水）から17日（金）まで臨時休館いたします。ご不便をおかけしますが、ご理解のほどよろしくお願いいたします。',
    tags: ['お知らせ', '会館'],
    visibility: 'members-only',
    source: '関ヶ谷だより',
    attachments: [],
    display_order: 2,
    is_pinned: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'a3',
    newsletter_id: 'n1',
    organization_id: 'org1',
    title: '新春俳句会の報告',
    category: 'culture',
    priority: 'low',
    deadline: null,
    headline: '俳句会報告',
    brief: '新春俳句会開催報告',
    summary: '新春俳句会が開催されました。入選句をご紹介します',
    content:
      '1月7日に新春俳句会が開催されました。今回は15名の方にご参加いただきました。入選句：「初日の出 希望を胸に また一歩」（田中花子）、「雪解けて 小川のせせらぎ 春近し」（佐藤太郎）',
    tags: ['文化', '俳句'],
    visibility: 'public',
    source: '会報ふれあい',
    attachments: [],
    display_order: 10,
    is_pinned: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'a4',
    newsletter_id: 'n1',
    organization_id: 'org1',
    title: '資源ごみ収集日の変更',
    category: 'notice',
    priority: 'medium',
    deadline: '2025-02-01',
    headline: 'ごみ収集変更',
    brief: '2月から資源ごみ収集日変更',
    summary: '2月1日から資源ごみの収集日が第2水曜日から第2木曜日に変更されます',
    content:
      '2月1日より、資源ごみの収集日が第2水曜日から第2木曜日に変更となります。お間違えのないようお願いいたします。',
    tags: ['ごみ', 'お知らせ'],
    visibility: 'public',
    source: '関ヶ谷だより',
    attachments: [],
    display_order: 3,
    is_pinned: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
];

/**
 * モックカテゴリ設定
 */
export const MOCK_CATEGORIES: Category[] = [
  { id: 'event', label: 'イベント', icon: '🎉', color: 'blue' },
  { id: 'notice', label: 'お知らせ', icon: '📢', color: 'yellow' },
  { id: 'meeting', label: '会議', icon: '📋', color: 'gray' },
  { id: 'culture', label: '文化', icon: '📚', color: 'purple' },
  { id: 'report', label: '報告', icon: '📊', color: 'green' },
];
