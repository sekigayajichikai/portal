/**
 * Coming Soonコンポーネント
 * 未実装の機能ページに表示するプレースホルダー
 * 
 * @description
 * ユーザーテスト時などに未実装機能を視覚的に表現するためのコンポーネント。
 * シンプルモードと通常モードの両方に対応したデザインを提供します。
 */
import React from 'react';

/**
 * ComingSoonコンポーネントのプロパティ
 */
interface ComingSoonProps {
  /** 機能名（例: "バススケジュール"） */
  featureName: string;
  /** 表示するアイコン（絵文字） */
  icon?: string;
  /** シンプルモードかどうか */
  isSimpleMode: boolean;
}

/**
 * Coming Soon表示コンポーネント
 * 
 * @param props - ComingSoonPropsオブジェクト
 * @returns Coming Soon画面のReactコンポーネント
 */
const ComingSoon: React.FC<ComingSoonProps> = ({ 
  featureName, 
  icon = '🚧', 
  isSimpleMode 
}) => {
  return (
    <div className={`flex flex-col items-center justify-center min-h-screen p-6 ${
      isSimpleMode ? 'bg-gray-50' : 'bg-gradient-to-br from-slate-900 to-slate-800'
    }`}>
      <div className={`text-center max-w-md ${
        isSimpleMode ? 'text-gray-700' : 'text-white'
      }`}>
        {/* アイコン */}
        <div className="text-8xl mb-6 animate-bounce">
          {icon}
        </div>
        
        {/* タイトル */}
        <h2 className={`text-3xl font-bold mb-4 ${
          isSimpleMode ? 'text-gray-800' : 'text-white'
        }`}>
          準備中
        </h2>
        
        {/* 機能名 */}
        <p className={`text-lg mb-2 ${
          isSimpleMode ? 'text-gray-600' : 'text-gray-300'
        }`}>
          {featureName}
        </p>
        
        {/* 説明文 */}
        <p className={`text-sm ${
          isSimpleMode ? 'text-gray-500' : 'text-gray-400'
        }`}>
          この機能は現在開発中です
        </p>
      </div>
    </div>
  );
};

export default ComingSoon;
