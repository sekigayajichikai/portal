/**
 * 自治会館 予約状況タブ（空き状況の確認・表示専用）
 *
 * 元アプリ book-system の MobileBookingView の見せ方を踏襲。
 * 週表示で、各日 時間帯（午前/午後/夜間）× 部屋 の予約状況を表示する。
 * 予約なしは「─」。予約の登録・編集は book-system 側で行う（ここは確認用）。
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getBookings } from '@cc-saas/shared';
import type { Booking } from '@cc-saas/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

/** 部屋マスター（元アプリ ROOMS を踏襲。id はDBの room 値＝正式名） */
const ROOMS = [
  { id: '会議室', shortName: '会議室' },
  { id: '和室（畳側）', shortName: '和室(畳)' },
  { id: '和室（椅子側）', shortName: '和室(椅子)' },
  { id: '図書室', shortName: '図書室' },
];

const TIME_SLOTS = [
  { id: 'morning', startTime: '9:00', endTime: '12:00', gasKey: '午前' as const },
  { id: 'afternoon', startTime: '13:00', endTime: '16:00', gasKey: '午後' as const },
  { id: 'night', startTime: '17:00', endTime: '20:00', gasKey: '夜間' as const },
];

const ROOM_DOT: Record<string, string> = {
  会議室: 'bg-yellow-400',
  '和室（畳側）': 'bg-sky-400',
  '和室（椅子側）': 'bg-sky-400',
  図書室: 'bg-pink-400',
};

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function formatShort(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
}

/** その週の日曜始まり */
function startOfWeek(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

const BookingsView: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        setBookings(await getBookings());
      } catch {
        setBookings([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // スワイプで週送り（元アプリの useSwipe を踏襲した簡易版）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let x0: number | null = null;
    const start = (e: TouchEvent) => (x0 = e.touches[0].clientX);
    const end = (e: TouchEvent) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) shiftWeek(dx < 0 ? 7 : -7);
      x0 = null;
    };
    el.addEventListener('touchstart', start);
    el.addEventListener('touchend', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchend', end);
    };
  });

  const shiftWeek = (delta: number) => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta);
      return d;
    });
  };

  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [weekStart]);

  const weekEnd = days[6];

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="max-w-2xl mx-auto" ref={containerRef}>
        <h2 className="text-xl font-bold text-gray-800 mb-1">自治会館の予約状況</h2>
        <p className="text-sm text-gray-500 mb-4">
          空いている部屋・時間帯を確認できます。予約のお申し込みは自治会館までお問い合わせください。
        </p>

        <div className="space-y-3">
          {/* 週ナビ */}
          <div className="flex items-center justify-between px-1">
            <button
              onClick={() => shiftWeek(-7)}
              aria-label="前の週"
              className="p-2 rounded-full hover:bg-gray-100 active:scale-90 transition-transform"
            >
              <ChevronLeft size={20} className="text-gray-500" />
            </button>
            <span className="text-base font-bold text-gray-700 tracking-wide">
              {formatShort(weekStart)} 〜 {formatShort(weekEnd)}
            </span>
            <button
              onClick={() => shiftWeek(7)}
              aria-label="次の週"
              className="p-2 rounded-full hover:bg-gray-100 active:scale-90 transition-transform"
            >
              <ChevronRight size={20} className="text-gray-500" />
            </button>
          </div>

          {/* 凡例 */}
          <div className="flex items-center justify-center gap-5 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              会議室
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
              和室
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-pink-400" />
              図書室
            </span>
          </div>

          {loading && <div className="text-center text-sm text-gray-400 py-4">読み込み中...</div>}

          {/* 日ブロック */}
          {days.map((date) => {
            const today = isToday(date);
            const dateStr = formatDate(date);
            const dow = date.getDay();
            const dayBookings = bookings.filter((b) => b.date === dateStr);

            return (
              <div
                key={dateStr}
                className={`rounded-xl border ${
                  today
                    ? 'border-emerald-400 bg-emerald-50/50 ring-2 ring-emerald-200'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {/* 日付ヘッダ */}
                <div className="flex items-baseline gap-2 px-4 py-2.5 border-b border-gray-100">
                  <span
                    className={`text-xl font-bold ${
                      today
                        ? 'text-emerald-600'
                        : dow === 0
                        ? 'text-red-500'
                        : dow === 6
                        ? 'text-blue-500'
                        : 'text-gray-800'
                    }`}
                  >
                    {date.getMonth() + 1}/{date.getDate()}
                  </span>
                  <span
                    className={`text-base ${
                      today
                        ? 'text-emerald-500'
                        : dow === 0
                        ? 'text-red-400'
                        : dow === 6
                        ? 'text-blue-400'
                        : 'text-gray-400'
                    }`}
                  >
                    ({DOW[dow]})
                  </span>
                  {today && (
                    <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold">
                      TODAY
                    </span>
                  )}
                </div>

                {/* 時間帯 */}
                <div className="px-3 py-2 space-y-2">
                  {TIME_SLOTS.map((slot) => {
                    const slotBookings = dayBookings.filter((b) => b.slot === slot.gasKey);
                    return (
                      <div key={slot.id}>
                        <div className="text-gray-600 mb-1">
                          <span className="text-base font-bold">{slot.gasKey}</span>{' '}
                          <span className="text-sm">
                            {slot.startTime}〜{slot.endTime}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {ROOMS.map((room) => {
                            const booking = slotBookings.find((b) => b.room === room.id);
                            return (
                              <div key={room.id} className="flex items-center gap-2 py-1 pl-2">
                                <span
                                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                    ROOM_DOT[room.id] || 'bg-gray-300'
                                  }`}
                                />
                                <span className="text-sm text-gray-600 w-20 shrink-0 truncate">
                                  {room.shortName}
                                </span>
                                {booking ? (
                                  <span className="text-base text-gray-800 truncate">
                                    {booking.title}
                                  </span>
                                ) : (
                                  <span className="text-base text-gray-200">─</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BookingsView;
