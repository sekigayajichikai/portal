import React, { useEffect, useState } from 'react';
import { getRadioPrograms } from '@cc-saas/shared';
import { RadioProgram } from '@cc-saas/shared/types';

interface CommunityRadioViewProps {
  isSimpleMode: boolean;
}

const CommunityRadioView: React.FC<CommunityRadioViewProps> = ({ isSimpleMode }) => {
  const [radioPrograms, setRadioPrograms] = useState<RadioProgram[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<RadioProgram | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  useEffect(() => {
    loadRadioPrograms();
  }, []);

  const loadRadioPrograms = async () => {
    try {
      setIsLoading(true);
      const programs = await getRadioPrograms();
      setRadioPrograms(programs);

      // 最新のプログラムを自動選択
      if (programs.length > 0) {
        setSelectedProgram(programs[0]);
      }
    } catch (error) {
      console.error('ラジオ番組の読み込みエラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    setDuration(audioRef.current.duration);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleSelectProgram = (program: RadioProgram) => {
    setSelectedProgram(program);
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
  return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  if (radioPrograms.length === 0) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="text-center py-20">
          <div className="w-32 h-32 mx-auto bg-slate-200 rounded-full flex items-center justify-center mb-4">
            <span className="text-4xl">📻</span>
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">
            {isSimpleMode ? 'ラジオ番組' : 'Community Radio'}
          </h2>
          <p className="text-slate-500">
            {isSimpleMode ? 'まだラジオ番組がありません' : 'No radio programs available yet'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      {/* ヘッダー */}
      <div className="text-center py-6">
        {isSimpleMode ? (
          <div className="w-32 h-32 mx-auto bg-slate-200 rounded-full flex items-center justify-center mb-4">
            <span className="text-4xl">📻</span>
          </div>
        ) : (
          <div className="w-48 h-48 mx-auto relative mb-8">
            <div className="absolute inset-0 bg-yellow-400 rounded-full animate-pulse opacity-20"></div>
            <div className="absolute inset-4 bg-rose-400 rounded-full animate-pulse delay-75 opacity-20"></div>
            <div className="absolute inset-8 bg-white rounded-full shadow-2xl flex items-center justify-center z-10 overflow-hidden border-8 border-slate-900">
              <div className={`text-6xl ${isPlaying ? 'animate-pulse' : ''}`}>📻</div>
            </div>
          </div>
        )}
        <h2 className="text-2xl font-black text-slate-800">
          {isSimpleMode ? '地域ラジオ' : 'Community Radio'}
        </h2>
        <p className="text-slate-500 font-bold">
          {selectedProgram ? selectedProgram.title : 'Now Playing...'}
        </p>
      </div>

      {/* メインプレイヤー */}
      <div
        className={`${isSimpleMode ? 'bg-white border border-slate-300 text-slate-900 rounded-xl' : 'bg-slate-900 text-white rounded-[2.5rem] shadow-2xl'} p-8`}
      >
        {selectedProgram && (
          <>
            {/* 音声要素（非表示） */}
            <audio
              ref={audioRef}
              src={selectedProgram.audio_url}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={() => setIsPlaying(false)}
            />

            <div className="flex flex-col items-center gap-6">
              {/* プログレスバー */}
              <div
                className={`w-full h-1.5 rounded-full overflow-hidden cursor-pointer ${isSimpleMode ? 'bg-slate-200' : 'bg-white/10'}`}
                onClick={handleSeek}
              >
                <div
                  className={`h-full rounded-full transition-all ${isSimpleMode ? 'bg-slate-600' : 'bg-pink-400'}`}
                  style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                ></div>
              </div>

              {/* 時間表示 */}
              <div className="flex justify-between w-full text-[10px] font-bold opacity-50 -mt-4">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>

              {/* コントロールボタン */}
              <div className="flex items-center gap-8">
                <button
                  onClick={() => {
                    const currentIndex = radioPrograms.findIndex(p => p.id === selectedProgram?.id);
                    if (currentIndex > 0) {
                      handleSelectProgram(radioPrograms[currentIndex - 1]);
                    }
                  }}
                  disabled={radioPrograms.findIndex(p => p.id === selectedProgram?.id) === 0}
                  className="text-2xl opacity-70 hover:opacity-100 transition-opacity disabled:opacity-30"
                >
                  ⏮️
                </button>

                <button
                  onClick={handlePlayPause}
                  className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl transition-all ${isSimpleMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-900 shadow-xl hover:scale-105 active:scale-95'}`}
                >
                  {isPlaying ? '⏸️' : '▶️'}
                </button>

                <button
                  onClick={() => {
                    const currentIndex = radioPrograms.findIndex(p => p.id === selectedProgram?.id);
                    if (currentIndex < radioPrograms.length - 1) {
                      handleSelectProgram(radioPrograms[currentIndex + 1]);
                    }
                  }}
                  disabled={radioPrograms.findIndex(p => p.id === selectedProgram?.id) === radioPrograms.length - 1}
                  className="text-2xl opacity-70 hover:opacity-100 transition-opacity disabled:opacity-30"
                >
                  ⏭️
                </button>
              </div>

              {/* 番組説明 */}
              <div className="w-full text-center mt-2">
                <p className={`text-sm ${isSimpleMode ? 'text-slate-600' : 'text-slate-300'}`}>
                  {selectedProgram.description}
                </p>
              </div>
            </div>
          </>
        )}

        {/* プレイリスト */}
        <div
          className={`mt-10 pt-6 border-t ${isSimpleMode ? 'border-slate-200' : 'border-white/10'}`}
        >
          <p
            className={`text-xs font-bold mb-4 uppercase tracking-widest ${isSimpleMode ? 'text-slate-500' : 'text-yellow-400'}`}
          >
            {isSimpleMode ? 'ラジオ番組一覧' : 'Radio Programs'}
          </p>
          <div className="space-y-3">
            {radioPrograms.map((program, index) => (
              <div
                key={program.id}
                onClick={() => handleSelectProgram(program)}
                className={`flex items-center gap-4 p-3 rounded-2xl transition-all cursor-pointer ${
                  selectedProgram?.id === program.id
                    ? isSimpleMode
                      ? 'bg-slate-200'
                      : 'bg-white/10'
                    : isSimpleMode
                      ? 'hover:bg-slate-50'
                      : 'hover:bg-white/5'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${
                    selectedProgram?.id === program.id
                      ? isSimpleMode
                        ? 'bg-slate-700 text-white'
                        : 'bg-pink-500 text-white'
                      : isSimpleMode
                        ? 'bg-slate-200 text-slate-600'
                        : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">{program.title}</p>
                  <p className="text-[10px] opacity-50">
                    {Math.floor(program.duration_seconds / 60)}分 • {program.article_count}件の記事
                  </p>
                </div>
                {selectedProgram?.id === program.id && isPlaying && (
                  <div className="flex gap-1">
                    <div className="w-1 h-4 bg-pink-500 animate-pulse"></div>
                    <div className="w-1 h-4 bg-pink-500 animate-pulse delay-75"></div>
                    <div className="w-1 h-4 bg-pink-500 animate-pulse delay-150"></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunityRadioView;
