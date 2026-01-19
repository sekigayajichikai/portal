import { GarbageInfo, BusSchedule, Event, User, Circular, Payment } from '@/types/types';

export const GARBAGE_DATA: GarbageInfo[] = [
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

export const BUS_SCHEDULES: BusSchedule[] = [
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

export const MOCK_USER: User = {
  id: 'u1',
  name: '山田 太郎',
  avatar: 'https://picsum.photos/seed/user/100/100',
  group: '3班',
};

export const INITIAL_CIRCULARS: Circular[] = [
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

export const INITIAL_PAYMENTS: Payment[] = [
  {
    id: 'p1',
    title: '2024年度 前期自治会費',
    amount: 3000,
    status: 'unpaid',
    dueDate: '2024-06-30',
  },
];
