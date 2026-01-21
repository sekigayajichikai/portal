import React, { useState, useEffect, useCallback } from 'react';
import { MOCK_GARBAGE_RULES } from '@/constants';
import { Bus, Trash2, Clock, MapPin, Upload, Edit, Trash, Loader, Calendar, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import type { BusSchedule } from '@cc-saas/shared/types';
import {
  fetchAllBusSchedules,
  saveBusSchedules,
  updateBusSchedule,
  deleteBusSchedule,
  bulkUpdateBusScheduleOrder,
  uploadPDF,
  extractBusScheduleFromPDF,
  convertPDFToBase64,
} from '@cc-saas/shared/services';
import { BusScheduleEditDialog } from './BusScheduleEditDialog';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * ドラッグ可能なバス停カードコンポーネント
 */
interface SortableBusCardProps {
  schedule: BusSchedule;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const SortableBusCard: React.FC<SortableBusCardProps> = ({
  schedule,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: schedule.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-lg overflow-hidden transition-all ${
        isDragging 
          ? 'border-blue-400 shadow-lg' 
          : 'border-slate-200'
      }`}
    >
      {/* カードヘッダー（常に表示） */}
      <div className="bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          {/* ドラッグハンドル */}
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-2 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
            style={{ touchAction: 'none' }}
            title="ドラッグして並び替え"
          >
            <GripVertical size={20} />
          </div>

          <button
            onClick={onToggle}
            className="flex-1 flex items-center gap-2 text-left hover:text-blue-600 transition-colors"
          >
            <MapPin size={16} className="text-slate-500 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-bold text-slate-800">
                {schedule.stopName}
              </h4>
              {schedule.destination && (
                <p className="text-xs text-slate-500 mt-0.5">
                  → {schedule.destination}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-slate-500 whitespace-nowrap">
                平日 {schedule.scheduleData.weekday.length}本
                {schedule.scheduleData.holiday.length > 0 && 
                  ` / 休日 ${schedule.scheduleData.holiday.length}本`
                }
              </div>
              {isExpanded ? (
                <ChevronUp size={18} className="text-slate-400 flex-shrink-0" />
              ) : (
                <ChevronDown size={18} className="text-slate-400 flex-shrink-0" />
              )}
            </div>
          </button>
          
          <div className="flex gap-1 ml-2 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="編集"
            >
              <Edit size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
              title="削除"
            >
              <Trash size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* カード詳細（トグルで開閉） */}
      {isExpanded && (
        <div className="bg-white p-4 border-t border-slate-100">
          {/* 備考 */}
          {schedule.notes && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <p className="text-xs text-amber-900">{schedule.notes}</p>
            </div>
          )}

          {/* 平日の時刻 */}
          {schedule.scheduleData.weekday.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-2">
                <Clock size={12} />
                平日
              </div>
              <div className="flex flex-wrap gap-2">
                {schedule.scheduleData.weekday.map((time, idx) => (
                  <div
                    key={idx}
                    className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded text-xs font-mono border border-blue-100"
                  >
                    {time}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 休日の時刻 */}
          {schedule.scheduleData.holiday.length > 0 && (
            <div>
              <div className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-2">
                <Calendar size={12} />
                休日
              </div>
              <div className="flex flex-wrap gap-2">
                {schedule.scheduleData.holiday.map((time, idx) => (
                  <div
                    key={idx}
                    className="bg-orange-50 text-orange-700 px-2.5 py-1 rounded text-xs font-mono border border-orange-100"
                  >
                    {time}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 有効期間 */}
          {(schedule.validFrom || schedule.validUntil) && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                有効期間: {schedule.validFrom || '開始日未設定'} 〜 {schedule.validUntil || '終了日未設定'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const LifestyleManager: React.FC = () => {
  const [busSchedules, setBusSchedules] = useState<BusSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [editingSchedule, setEditingSchedule] = useState<Omit<BusSchedule, 'id' | 'createdAt' | 'updatedAt'> | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  // 路線管理用の状態
  const [routes, setRoutes] = useState<string[]>([]);
  const [newRouteName, setNewRouteName] = useState('');
  const [selectedRoute, setSelectedRoute] = useState<string>('');
  
  // トグル開閉状態を管理（バス停ごとのID）
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // データ読み込み
  useEffect(() => {
    loadBusSchedules();
  }, []);

  const loadBusSchedules = async () => {
    try {
      setIsLoading(true);
      const schedules = await fetchAllBusSchedules();
      setBusSchedules(schedules);
      
      // 既存の路線名を抽出
      const uniqueRoutes = Array.from(new Set(schedules.map(s => s.routeName).filter(Boolean)));
      setRoutes(uniqueRoutes);
      
      // デフォルトで最初の路線を選択
      if (uniqueRoutes.length > 0 && !selectedRoute) {
        setSelectedRoute(uniqueRoutes[0]);
      }
    } catch (error) {
      console.error('バス時刻表の読み込みに失敗しました:', error);
      alert('バス時刻表の読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 路線を追加
  const handleAddRoute = () => {
    if (!newRouteName.trim()) {
      alert('路線名を入力してください');
      return;
    }
    
    if (routes.includes(newRouteName.trim())) {
      alert('この路線名は既に登録されています');
      return;
    }
    
    const updatedRoutes = [...routes, newRouteName.trim()];
    setRoutes(updatedRoutes);
    setSelectedRoute(newRouteName.trim());
    setNewRouteName('');
  };

  // PDFアップロード処理（複数ファイル対応）
  const handlePDFUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // 路線が選択されているか確認
    if (!selectedRoute) {
      alert('路線を選択してください');
      event.target.value = '';
      return;
    }

    // PDFファイルのみをフィルタリング
    const pdfFiles = Array.from(files).filter((file) => file.type === 'application/pdf');

    if (pdfFiles.length === 0) {
      alert('PDFファイルを選択してください');
      return;
    }

    if (pdfFiles.length !== files.length) {
      alert(`${files.length - pdfFiles.length}件のPDF以外のファイルはスキップされました`);
    }

    try {
      setIsUploading(true);
      let totalSchedules = 0;
      let processedFiles = 0;

      // 各PDFファイルを順番に処理
      for (const file of pdfFiles) {
        processedFiles++;
        setUploadProgress(
          `PDFを処理中... (${processedFiles}/${pdfFiles.length}) - ${file.name}`
        );

        try {
          // PDFをSupabase Storageにアップロード
          const uploadResult = await uploadPDF(file, 'bus-schedule');
          console.log(`📤 PDFアップロード完了 (${file.name}):`, uploadResult);

          setUploadProgress(
            `AIで時刻表を解析中... (${processedFiles}/${pdfFiles.length}) - ${file.name}`
          );

          // PDFをBase64に変換
          const pdfBase64 = await convertPDFToBase64(file);

          // AIで時刻表を抽出
          const extractionResult = await extractBusScheduleFromPDF(pdfBase64);
          console.log(`🤖 AI抽出結果 (${file.name}):`, extractionResult);

          if (extractionResult.schedules.length === 0) {
            console.warn(`時刻表データが見つかりませんでした: ${file.name}`);
            continue;
          }

          // PDFのURLと選択した路線名を各スケジュールに追加
          const schedulesWithPdfUrl = extractionResult.schedules.map((schedule) => ({
            ...schedule,
            routeName: selectedRoute, // 選択した路線名を使用
            sourcePdfUrl: uploadResult.url,
          }));

          // 複数のスケジュールを保存
          await saveBusSchedules(schedulesWithPdfUrl);
          totalSchedules += extractionResult.schedules.length;

          console.log(
            `✅ ${file.name} から ${extractionResult.schedules.length}件の時刻表を保存しました`
          );
        } catch (fileError: any) {
          console.error(`${file.name} の処理中にエラー:`, fileError);
          alert(`${file.name} の処理に失敗しました: ${fileError.message}\n\n他のファイルの処理を続行します。`);
        }
      }

      if (totalSchedules > 0) {
        alert(
          `✅ 処理完了！\n\n処理ファイル数: ${processedFiles}/${pdfFiles.length}\n保存した時刻表: ${totalSchedules}件`
        );
        await loadBusSchedules();
      } else {
        alert('時刻表データが見つかりませんでした。PDFの内容を確認してください。');
      }
    } catch (error: any) {
      console.error('PDFアップロードエラー:', error);
      alert(`エラーが発生しました: ${error.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress('');
      // inputをリセット
      event.target.value = '';
    }
  };

  // 編集開始
  const handleEdit = (schedule: BusSchedule) => {
    setEditingSchedule(schedule);
    setIsEditDialogOpen(true);
  };

  // 編集確定
  const handleEditConfirm = async (updatedSchedule: Omit<BusSchedule, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      if ('id' in editingSchedule!) {
        // 既存のスケジュールを更新
        await updateBusSchedule((editingSchedule as BusSchedule).id, updatedSchedule);
        alert('バス時刻表を更新しました');
      }
      setIsEditDialogOpen(false);
      setEditingSchedule(null);
      await loadBusSchedules();
    } catch (error: any) {
      console.error('更新エラー:', error);
      alert(`更新に失敗しました: ${error.message}`);
    }
  };

  // 削除
  const handleDelete = async (schedule: BusSchedule) => {
    if (!confirm(`「${schedule.routeName} - ${schedule.stopName}」を削除しますか？`)) {
      return;
    }

    try {
      await deleteBusSchedule(schedule.id);
      alert('バス時刻表を削除しました');
      await loadBusSchedules();
    } catch (error: any) {
      console.error('削除エラー:', error);
      alert(`削除に失敗しました: ${error.message}`);
    }
  };

  // トグル開閉
  const toggleCard = (scheduleId: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(scheduleId)) {
        newSet.delete(scheduleId);
      } else {
        newSet.add(scheduleId);
      }
      return newSet;
    });
  };

  // ドラッグ&ドロップのセンサー設定
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3, // 3px以上動かすとドラッグ開始
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // ドラッグ開始のハンドラー
  const handleDragStart = useCallback((event: any) => {
    console.log('🚀 ドラッグ開始:', event.active.id);
  }, []);

  // ドラッグキャンセルのハンドラー
  const handleDragCancel = useCallback(() => {
    console.log('❌ ドラッグキャンセル');
  }, []);

  // ドラッグ終了時の処理
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    // active.idとover.idから路線を特定
    setBusSchedules((currentSchedules) => {
      // active.idから路線を特定
      const activeSchedule = currentSchedules.find(s => s.id === active.id);
      if (!activeSchedule) {
        return currentSchedules;
      }

      const route = activeSchedule.routeName;
      const routeSchedules = currentSchedules
        .filter(s => s.routeName === route && s.isActive !== false)
        .sort((a, b) => a.displayOrder - b.displayOrder);

      const oldIndex = routeSchedules.findIndex(s => s.id === active.id);
      const newIndex = routeSchedules.findIndex(s => s.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return currentSchedules;
      }

      // 配列を並び替え
      const reorderedSchedules = arrayMove(routeSchedules, oldIndex, newIndex);
      console.log('✅ 並び替え完了:', reorderedSchedules.map(s => s.stopName).join(' → '));

      // UIを即座に更新（楽観的更新）
      const updatedBusSchedules = currentSchedules
        .map(schedule => {
          if (schedule.routeName !== route || schedule.isActive === false) {
            return schedule;
          }
          const newOrder = reorderedSchedules.findIndex(s => s.id === schedule.id);
          return {
            ...schedule,
            displayOrder: newOrder,
          };
        })
        .sort((a, b) => {
          // 同じ路線内ではdisplayOrderでソート
          if (a.routeName === b.routeName) {
            return a.displayOrder - b.displayOrder;
          }
          // 異なる路線は元の順序を維持
          return 0;
        });

      // データベースに順序を保存（非同期）
      const updates = reorderedSchedules.map((schedule, index) => ({
        scheduleId: schedule.id,
        displayOrder: index,
      }));

      bulkUpdateBusScheduleOrder(updates)
        .then(() => {
          console.log('✅ バス時刻表の順序を更新しました');
        })
        .catch((error: any) => {
          console.error('順序更新エラー:', error);
          alert(`順序の更新に失敗しました: ${error.message}`);
          // エラー時は再読み込み
          loadBusSchedules();
        });

      return updatedBusSchedules;
    });
  }, []);

  return (
    <div className="space-y-8">
      {/* Bus Schedule */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <Bus size={20} />
          </div>
          <h2 className="text-lg font-bold text-slate-700">バス時刻表</h2>
        </div>

        {/* 路線登録セクション */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6">
          <h3 className="font-bold text-slate-800 mb-4">路線を登録</h3>
          
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              value={newRouteName}
              onChange={(e) => setNewRouteName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddRoute()}
              placeholder="路線名を入力（例: 金沢シーサイドライン）"
              className="flex-1 p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={handleAddRoute}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              登録
            </button>
          </div>

          {/* 登録済み路線一覧 */}
          {routes.length > 0 && (
            <div>
              <p className="text-sm text-slate-600 mb-2">登録済みの路線:</p>
              <div className="flex flex-wrap gap-2">
                {routes.map((route) => (
                  <button
                    key={route}
                    onClick={() => setSelectedRoute(route)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      selectedRoute === route
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {route}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* PDFアップロードセクション */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800">PDFをアップロード</h3>
              {selectedRoute && (
                <p className="text-sm text-slate-600 mt-1">
                  路線「<span className="font-medium text-blue-600">{selectedRoute}</span>」にPDFを追加
                </p>
              )}
            </div>

            {/* PDFアップロードボタン */}
            <div>
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={handlePDFUpload}
              className="hidden"
              id="bus-pdf-upload"
              disabled={isUploading}
            />
            <label
              htmlFor="bus-pdf-upload"
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium cursor-pointer transition-colors ${
                isUploading
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isUploading ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  処理中...
                </>
              ) : (
                <>
                  <Upload size={16} />
                  PDFをアップロード
                </>
              )}
            </label>
          </div>
          </div>

          {/* アップロード進捗 */}
          {uploadProgress && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 text-blue-700">
                <Loader size={16} className="animate-spin" />
                <span className="text-sm font-medium">{uploadProgress}</span>
              </div>
            </div>
          )}
        </div>

        {/* バス時刻表一覧 */}
        {isLoading ? (
          <div className="text-center py-12">
            <Loader size={32} className="animate-spin mx-auto text-slate-400" />
            <p className="text-slate-500 mt-2">読み込み中...</p>
          </div>
        ) : busSchedules.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200">
            <Bus size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 font-medium">
              バス時刻表が登録されていません
            </p>
            <p className="text-slate-500 text-sm mt-1">
              まず路線を登録してから、PDFをアップロードしてください
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 路線ごとにセクションを作成 */}
            {routes.map((route) => {
              // アクティブなスケジュールのみを表示（displayOrderでソート）
              const routeSchedules = busSchedules
                .filter(s => s.routeName === route && s.isActive !== false)
                .sort((a, b) => a.displayOrder - b.displayOrder);
              if (routeSchedules.length === 0) return null;

              return (
                <div key={route} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  {/* 路線名のヘッダー */}
                  <div className="bg-blue-50 border-b border-blue-100 px-4 py-3">
                    <h3 className="font-bold text-blue-900 flex items-center gap-2">
                      <Bus size={18} />
                      {route}
                    </h3>
                  </div>

                  {/* バス停カード一覧（ドラッグ&ドロップ対応） */}
                  <div className="p-4">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragCancel={handleDragCancel}
                    >
                      <SortableContext
                        items={routeSchedules.map(s => s.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {routeSchedules.map((schedule) => (
                            <SortableBusCard
                              key={schedule.id}
                              schedule={schedule}
                              isExpanded={expandedCards.has(schedule.id)}
                              onToggle={() => toggleCard(schedule.id)}
                              onEdit={() => handleEdit(schedule)}
                              onDelete={() => handleDelete(schedule)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 編集ダイアログ */}
      <BusScheduleEditDialog
        isOpen={isEditDialogOpen}
        schedule={editingSchedule}
        onConfirm={handleEditConfirm}
        onCancel={() => {
          setIsEditDialogOpen(false);
          setEditingSchedule(null);
        }}
      />

      {/* Garbage Rules */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-green-100 text-green-600 rounded-lg">
            <Trash2 size={20} />
          </div>
          <h2 className="text-lg font-bold text-slate-700">ゴミ収集カレンダー管理</h2>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
            {MOCK_GARBAGE_RULES.map((rule) => (
              <div key={rule.id} className="p-6 text-center hover:bg-slate-50 transition-colors">
                <div className="text-4xl mb-3">{rule.icon}</div>
                <h3 className="font-bold text-slate-800 mb-1">{rule.type}</h3>
                <div className="inline-block bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold mb-3">
                  {rule.dayOfWeek}
                </div>
                <p className="text-sm text-slate-500 leading-snug">{rule.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
