/**
 * アプリケーションエントリーポイント
 * 
 * Reactアプリケーションを初期化し、エラーバウンダリーで保護します。
 */

import React, { Component, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/**
 * エラーバウンダリーコンポーネント
 * アプリケーション全体のエラーを捕捉し、クラッシュを防止します
 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('アプリケーションエラー:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '2rem', 
          textAlign: 'center', 
          fontFamily: 'sans-serif',
          color: '#dc2626'
        }}>
          <h1>エラーが発生しました</h1>
          <p>アプリケーションの読み込み中にエラーが発生しました。</p>
          <details style={{ marginTop: '1rem', textAlign: 'left' }}>
            <summary>エラー詳細</summary>
            <pre style={{ 
              marginTop: '0.5rem', 
              padding: '1rem', 
              backgroundColor: '#f3f4f6',
              borderRadius: '0.5rem',
              overflow: 'auto'
            }}>
              {this.state.error?.toString()}
            </pre>
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer'
            }}
          >
            ページを再読み込み
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// デバッグログ：アプリ起動時
console.log("App Starting...");
console.log("API Key exists:", !!import.meta.env.VITE_GEMINI_API_KEY);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);