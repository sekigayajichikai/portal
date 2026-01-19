export enum AppView {
  DASHBOARD = 'DASHBOARD',
  MEMBERS = 'MEMBERS',
  CIRCULAR_BOARD = 'CIRCULAR_BOARD',
  FEES = 'FEES',
  LIFESTYLE = 'LIFESTYLE', // Bus & Garbage
  PUBLIC_CONTENT = 'PUBLIC_CONTENT', // Extracted events
  RADIO_STATION = 'RADIO_STATION', // AI Radio
}

export interface Member {
  id: string;
  name: string;
  address: string;
  group: string; // 班 (Ban)
  phone: string;
  email?: string;
  hasPaidFee: boolean;
  hasReadLatestCircular: boolean;
  role: 'member' | 'leader' | 'admin';
}

export interface Circular {
  id: string;
  title: string;
  content: string;
  date: string;
  category: 'event' | 'notice' | 'disaster' | 'other';
  author: string;
  readCount: number;
  totalTarget: number;
  extractedEvents?: PublicEvent[];
}

export interface PublicEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  location: string;
  description: string;
  isPublic: boolean;
}

export interface BusSchedule {
  id: string;
  route: string;
  stopName: string;
  times: string[]; // "08:00", "09:30"
}

export interface GarbageRule {
  id: string;
  type: string; // Burnable, Plastic, etc.
  dayOfWeek: string;
  icon: string;
  description: string;
}

export interface RadioProgram {
  id: string;
  title: string;
  sourceText: string;
  script: string;
  audioUrl?: string; // Blob URL
  createdAt: string;
  status: 'draft' | 'scripted' | 'produced';
}

