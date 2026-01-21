import React, { useState, useEffect } from 'react';
import { MOCK_GARBAGE_RULES } from '@/constants';
import { Bus, Trash2, Clock, MapPin, Upload, Edit, Trash, Loader, Calendar } from 'lucide-react';
import type { BusSchedule } from '@cc-saas/shared/types';
import {
  fetchAllBusSchedules,
  saveBusSchedules,
  updateBusSchedule,
  deleteBusSchedule,
  uploadPDF,
  extractBusScheduleFromPDF,
  convertPDFToBase64,
} from '@cc-saas/shared/services';
import { BusScheduleEditDialog } from './BusScheduleEditDialog';

export const LifestyleManager: React.FC = () => {
  const [busSchedules, setBusSchedules] = useState<BusSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [editingSchedule, setEditingSchedule] = useState<Omit<BusSchedule, 'id' | 'createdAt' | 'updatedAt'> | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // データ読み込み
  useEffect(() => {
    loadBusSchedules();
  }, []);

  const loadBusSchedules = async () => {
    try {
      setIsLoading(true);
      const schedules = await fetchAllBusSchedules();
      setBusSchedules(schedules);
    } catch (error) {
      console.error('バス時刻表の読み込みに失敗しました:', error);
      alert('バス時刻表の読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // PDFアップロード処理（複数ファイル対応）
  const handlePDFUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

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

          // PDFのURLを各スケジュールに追加
          const schedulesWithPdfUrl = extractionResult.schedules.map((schedule) => ({
            ...schedule,
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

  return (
    <div className="space-y-8">
      {/* Bus Schedule */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <Bus size={20} />
            </div>
            <h2 className="text-lg font-bold text-slate-700">バス時刻表</h2>
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
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 text-blue-700">
              <Loader size={16} className="animate-spin" />
              <span className="text-sm font-medium">{uploadProgress}</span>
            </div>
          </div>
        )}

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
              PDFをアップロードして時刻表を登録してください
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {busSchedules.map((schedule) => (
              <div
                key={schedule.id}
                className={`bg-white p-5 rounded-2xl shadow-sm border ${
                  schedule.isActive ? 'border-slate-200' : 'border-slate-100 opacity-60'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">
                      {schedule.routeName}
                    </h3>
                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                      <MapPin size={12} />
                      {schedule.stopName} 発
                      {schedule.destination && ` → ${schedule.destination}`}
                    </div>
                    {schedule.notes && (
                      <p className="text-xs text-slate-600 mt-2 bg-slate-50 p-2 rounded">
                        {schedule.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(schedule)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="編集"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(schedule)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="削除"
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                </div>

                {/* 平日の時刻 */}
                <div className="mt-4">
                  <div className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-2">
                    <Clock size={12} />
                    平日
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {schedule.scheduleData.weekday.slice(0, 6).map((time, idx) => (
                      <div
                        key={idx}
                        className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-sm font-mono border border-blue-100"
                      >
                        {time}
                      </div>
                    ))}
                    {schedule.scheduleData.weekday.length > 6 && (
                      <div className="bg-slate-50 text-slate-500 px-3 py-1.5 rounded-lg text-xs">
                        +{schedule.scheduleData.weekday.length - 6}本
                      </div>
                    )}
                  </div>
                </div>

                {/* 休日の時刻 */}
                {schedule.scheduleData.holiday.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-2">
                      <Calendar size={12} />
                      休日
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {schedule.scheduleData.holiday.slice(0, 6).map((time, idx) => (
                        <div
                          key={idx}
                          className="bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg text-sm font-mono border border-orange-100"
                        >
                          {time}
                        </div>
                      ))}
                      {schedule.scheduleData.holiday.length > 6 && (
                        <div className="bg-slate-50 text-slate-500 px-3 py-1.5 rounded-lg text-xs">
                          +{schedule.scheduleData.holiday.length - 6}本
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
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
