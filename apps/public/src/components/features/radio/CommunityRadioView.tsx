import React from 'react';

interface CommunityRadioViewProps {
  isSimpleMode: boolean;
}

const CommunityRadioView: React.FC<CommunityRadioViewProps> = ({ isSimpleMode }) => {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="text-center py-10">
        {isSimpleMode ? (
          <div className="w-32 h-32 mx-auto bg-slate-200 rounded-full flex items-center justify-center mb-4">
            <span className="text-4xl">📻</span>
          </div>
        ) : (
          <div className="w-48 h-48 mx-auto relative mb-8">
            <div className="absolute inset-0 bg-yellow-400 rounded-full animate-pulse opacity-20"></div>
            <div className="absolute inset-4 bg-rose-400 rounded-full animate-pulse delay-75 opacity-20"></div>
            <div className="absolute inset-8 bg-white rounded-full shadow-2xl flex items-center justify-center z-10 overflow-hidden border-8 border-slate-900">
              <img
                src="https://picsum.photos/seed/vinyl/200/200"
                alt="Cover"
                className="animate-[spin_10s_linear_infinite]"
              />
              <div className="absolute w-6 h-6 bg-white rounded-full border-4 border-slate-900 z-20"></div>
            </div>
          </div>
        )}
        <h2 className="text-2xl font-black text-slate-800">
          {isSimpleMode ? '地域放送' : 'Community Radio'}
        </h2>
        <p className="text-slate-500 font-bold">Now Playing: Sunset Vibes Mix</p>
      </div>

      <div
        className={`${isSimpleMode ? 'bg-white border border-slate-300 text-slate-900 rounded-xl' : 'bg-slate-900 text-white rounded-[2.5rem] shadow-2xl'} p-8`}
      >
        <div className="flex flex-col items-center gap-6">
          <div
            className={`w-full h-1.5 rounded-full overflow-hidden ${isSimpleMode ? 'bg-slate-200' : 'bg-white/10'}`}
          >
            <div
              className={`w-1/3 h-full rounded-full ${isSimpleMode ? 'bg-slate-600' : 'bg-yellow-400'}`}
            ></div>
          </div>
          <div className="flex justify-between w-full text-[10px] font-bold opacity-50 -mt-4">
            <span>1:24</span>
            <span>4:05</span>
          </div>
          <div className="flex items-center gap-8">
            <button className="text-2xl opacity-70 hover:opacity-100 transition-opacity">⏮️</button>
            <button
              className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl transition-all ${isSimpleMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-900 shadow-xl hover:scale-105 active:scale-95'}`}
            >
              ▶️
            </button>
            <button className="text-2xl opacity-70 hover:opacity-100 transition-opacity">⏭️</button>
          </div>
        </div>

        <div
          className={`mt-10 pt-6 border-t ${isSimpleMode ? 'border-slate-200' : 'border-white/10'}`}
        >
          <p
            className={`text-xs font-bold mb-4 uppercase tracking-widest ${isSimpleMode ? 'text-slate-500' : 'text-yellow-400'}`}
          >
            {isSimpleMode ? '再生リスト' : 'Neighborhood Playlist'}
          </p>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex items-center gap-4 p-2 rounded-2xl transition-all cursor-pointer ${isSimpleMode ? 'hover:bg-slate-50' : 'hover:bg-white/5'}`}
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${isSimpleMode ? 'bg-slate-200 text-slate-600' : 'bg-slate-800 text-slate-400'}`}
                >
                  {i}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">Local Artists Track {i}</p>
                  <p className="text-[10px] opacity-50">Community Picks Vol.{i}</p>
                </div>
                <span className="text-xs opacity-50">3:45</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunityRadioView;
