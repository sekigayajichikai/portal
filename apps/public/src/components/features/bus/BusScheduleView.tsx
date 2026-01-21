/**
 * バス時刻表ビューコンポーネント（リニューアル版）
 *
 * お気に入りバス停の管理、方面切り替え、時刻表示を統合したUIを提供します。
 */

import React, { useState, useMemo } from 'react';
import { X, MapPin } from 'lucide-react';
import { BusSchedule } from '@/types/types';
import { useBusSchedule } from '@/hooks/useBusSchedule';
import { useFavoriteBusStops } from '@/hooks/useFavoriteBusStops';
import { groupByBusStop, getUniqueBusStops } from '@cc-saas/shared/utils';
import { BusStopSelector } from './BusStopSelector';
import { DirectionSwitch } from './DirectionSwitch';

interface BusScheduleViewProps {
  isSimpleMode: boolean;
  busSchedules: BusSchedule[];
  currentTime: Date;
}

const BusScheduleView: React.FC<BusScheduleViewProps> = ({
  isSimpleMode,
  busSchedules,
  currentTime,
}) => {
  const { getNextBus, calculateMinutesUntil } = useBusSchedule(currentTime);
  const { favorites, addFavorite, removeFavorite, maxFavorites } = useFavoriteBusStops();

  // 各バス停の選択中の方面を管理
  const [selectedDestinations, setSelectedDestinations] = useState<Record<string, string>>({});

  // デバッグ: データを確認
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚌 BusScheduleView - データ確認:');
  console.log('  📊 取得したバス時刻表の件数:', busSchedules.length);
  console.log('  📝 バス時刻表の詳細:', busSchedules);
  console.log('  ⭐ お気に入りバス停:', favorites);
  console.log('  📍 お気に入りの件数:', favorites.length);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // バス停をグループ化
  const busStopGroups = useMemo(() => {
    const groups = groupByBusStop(busSchedules);
    console.log('🚌 グループ化されたバス停:');
    console.log('  📦 グループ数:', groups.length);
    console.log('  📦 グループの詳細:', groups);
    console.log('  🏷️ バス停名のリスト:', groups.map(g => g.stopName));
    return groups;
  }, [busSchedules]);

  // お気に入りバス停のみフィルタリング
  const favoriteBusStops = useMemo(() => {
    const filtered = busStopGroups.filter((group) => favorites.includes(group.stopName));
    console.log('🚌 お気に入りバス停のフィルタリング:');
    console.log('  ⭐ お気に入りに登録済み:', filtered.map(g => g.stopName));
    console.log('  ⭐ お気に入りの件数:', filtered.length);
    return filtered;
  }, [busStopGroups, favorites]);

  // 利用可能なバス停（お気に入り以外）
  const availableStops = useMemo(() => {
    const allStops = getUniqueBusStops(busSchedules);
    console.log('🚌 利用可能なバス停の計算:');
    console.log('  📍 全バス停のリスト:', allStops);
    console.log('  📍 全バス停の件数:', allStops.length);
    console.log('  ⭐ お気に入り:', favorites);

    const available = allStops.filter((stop) => !favorites.includes(stop));
    console.log('  ✅ ドロップダウンに表示するバス停:', available);
    console.log('  ✅ ドロップダウンに表示する件数:', available.length);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return available;
  }, [busSchedules, favorites]);

  // 方面選択のハンドラ
  const handleDestinationChange = (stopName: string, destination: string) => {
    setSelectedDestinations((prev) => ({
      ...prev,
      [stopName]: destination,
    }));
  };

  // 選択された方面を取得（デフォルトは最初の方面）
  const getSelectedDestination = (stopName: string, destinations: string[]): string => {
    return selectedDestinations[stopName] || destinations[0] || '';
  };

  const headingClass = isSimpleMode
    ? 'text-xl font-bold text-slate-900 px-1 mb-4 border-l-4 border-slate-600 pl-3'
    : 'text-2xl font-black px-2 mb-4 text-slate-800';

  const cardBaseClass = isSimpleMode
    ? 'bg-white rounded-xl shadow-sm border border-slate-300 p-4'
    : 'bg-white rounded-[2rem] shadow-xl p-6 border-2 border-slate-50';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      {/* ヘッダー */}
      <div className="flex justify-between items-end px-2">
        <h2 className={headingClass}>{isSimpleMode ? 'バス時刻表' : '🚌 バス情報'}</h2>
        <p className="text-xs font-bold text-slate-400">
          {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 更新
        </p>
      </div>

      {/* バス停追加ボタン */}
      <BusStopSelector
        availableStops={availableStops}
        onAddFavorite={addFavorite}
        maxFavorites={maxFavorites}
        currentCount={favorites.length}
        isSimpleMode={isSimpleMode}
      />

      {/* データ不足の警告（本番環境） */}
      {!import.meta.env.DEV && busSchedules.length === 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 mb-4">
          <p className="text-amber-800 font-bold mb-2">⚠️ バス時刻表が登録されていません</p>
          <p className="text-sm text-amber-700">
            管理者にお問い合わせください。バス時刻表のデータが登録されていない可能性があります。
          </p>
        </div>
      )}

      {/* お気に入りバス停の時刻表 */}
      {favoriteBusStops.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-2xl">
          <p className="text-slate-600 font-medium mb-2">お気に入りバス停がありません</p>
          <p className="text-sm text-slate-500">上のボタンからバス停を追加してください</p>
          {availableStops.length === 0 && busSchedules.length > 0 && (
            <p className="text-xs text-amber-600 mt-3">
              ℹ️ 全てのバス停が既にお気に入りに登録されています
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {favoriteBusStops.map((busStop) => {
            const destinations = busStop.destinations.map((d) => d.destination);
            const selectedDest = getSelectedDestination(busStop.stopName, destinations);
            const destinationData = busStop.destinations.find((d) => d.destination === selectedDest);

            if (!destinationData || destinationData.schedules.length === 0) {
              return null;
            }

            // 現在の曜日に応じた時刻を取得
            const schedule = destinationData.schedules[0];
            const day = currentTime.getDay();
            const isHoliday = day === 0 || day === 6;
            const times = isHoliday
              ? schedule.scheduleData.holiday
              : schedule.scheduleData.weekday;

            if (times.length === 0) {
              return null;
            }

            const nextTime = times.find((time) => {
              const [hour, minute] = time.split(':').map(Number);
              const timeMinutes = hour * 60 + minute;
              const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
              return timeMinutes > currentMinutes;
            }) || times[0];

            const minutesLeft = calculateMinutesUntil(nextTime);

            return (
              <div key={busStop.stopName} className={cardBaseClass}>
                {/* バス停名と削除ボタン */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <MapPin size={20} className="text-blue-600" />
                    <h3 className="font-bold text-lg text-slate-800">{busStop.stopName}</h3>
                  </div>
                  <button
                    onClick={() => removeFavorite(busStop.stopName)}
                    className="text-slate-400 hover:text-red-600 transition-colors"
                    title="お気に入りから削除"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* 方面切り替えボタン */}
                <DirectionSwitch
                  destinations={destinations}
                  selected={selectedDest}
                  onChange={(dest) => handleDestinationChange(busStop.stopName, dest)}
                  isSimpleMode={isSimpleMode}
                />

                {/* 次のバス情報 */}
                <div
                  className={`flex items-center gap-4 p-4 mb-4 ${
                    isSimpleMode ? 'bg-slate-100 rounded-lg' : 'bg-blue-50 rounded-2xl'
                  }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full ${
                      isSimpleMode ? 'bg-slate-500' : 'bg-blue-500 animate-ping'
                    }`}
                  ></div>
                  <div>
                    <p
                      className={`text-xs font-bold ${
                        isSimpleMode ? 'text-slate-600' : 'text-blue-600'
                      }`}
                    >
                      次のバス
                    </p>
                    <p
                      className={`text-2xl font-black ${
                        isSimpleMode ? 'text-slate-900' : 'text-blue-700'
                      }`}
                    >
                      {nextTime}
                    </p>
                  </div>
                  <div className="ml-auto text-right">
                    <p
                      className={`text-sm font-bold ${
                        isSimpleMode ? 'text-slate-700' : 'text-blue-700'
                      }`}
                    >
                      あと {minutesLeft} 分
                    </p>
                  </div>
                </div>

                {/* 時刻表リスト */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {times.slice(0, 6).map((t, i) => (
                    <div
                      key={i}
                      className={`px-4 py-2 text-sm font-bold flex-shrink-0 ${
                        t === nextTime
                          ? isSimpleMode
                            ? 'bg-slate-800 text-white rounded-lg'
                            : 'bg-blue-500 text-white rounded-xl'
                          : isSimpleMode
                            ? 'bg-white border border-slate-300 text-slate-600 rounded-lg'
                            : 'bg-slate-50 text-slate-400 rounded-xl'
                      }`}
                    >
                      {t}
                    </div>
                  ))}
                  {times.length > 6 && (
                    <div className="px-4 py-2 bg-slate-100 rounded-xl text-sm font-bold text-slate-400 flex-shrink-0 italic">
                      +{times.length - 6}本
                    </div>
                  )}
                </div>

                {/* 平日/休日表示 */}
                <p className="text-xs text-slate-500 mt-2">
                  {isHoliday ? '休日ダイヤ' : '平日ダイヤ'}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BusScheduleView;
