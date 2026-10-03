import React from 'react';
import type { RecentItem } from '../../types';

export interface WelcomeViewProps {
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onQuickOpen: () => void;
  onSelectRecent: (item: RecentItem) => void;
  recentItems: RecentItem[];
  onClearRecent: () => void;
  onRemoveRecent?: (path: string) => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'たった今';
  if (diff < hour) return `${Math.floor(diff / minute)}分前`;
  if (diff < day) return `${Math.floor(diff / hour)}時間前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}日前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({
  onOpenFile,
  onOpenFolder,
  onQuickOpen,
  onSelectRecent,
  recentItems,
  onClearRecent,
  onRemoveRecent,
}) => {
  return (
    <div className="welcome-view">
      <div className="welcome-content">
        {/* ヒーローセクション */}
        <div className="welcome-hero">
          <div className="welcome-logo">🪶</div>
          <div className="welcome-title-row">
            <h1 className="welcome-title">FeatherMark</h1>
            <span className="welcome-badge">v1.0.0</span>
          </div>
          <p className="welcome-subtitle">
            Windows向け 羽のように軽量・高速なMarkdownビューア
          </p>
        </div>

        {/* クイックアクションボタン */}
        <div className="welcome-actions">
          <button
            type="button"
            className="welcome-action-btn primary"
            onClick={onOpenFolder}
          >
            <span>📁</span>
            <span>フォルダを開く</span>
          </button>
          <button
            type="button"
            className="welcome-action-btn"
            onClick={onOpenFile}
          >
            <span>📄</span>
            <span>ファイルを開く</span>
          </button>
          <button
            type="button"
            className="welcome-action-btn"
            onClick={onQuickOpen}
          >
            <span>🔍</span>
            <span>クイックオープン</span>
          </button>
        </div>

        {/* ダッシュボードカードグリッド */}
        <div className="welcome-grid">
          {/* 左カード: 最近開いた項目 */}
          <div className="welcome-card">
            <div className="welcome-card-header">
              <div className="welcome-card-title">
                <span>🕒</span>
                <span>最近開いた項目</span>
              </div>
              {recentItems.length > 0 && (
                <button
                  type="button"
                  className="welcome-clear-btn"
                  onClick={onClearRecent}
                  title="履歴をすべて消去"
                >
                  すべて消去
                </button>
              )}
            </div>

            {recentItems.length === 0 ? (
              <div className="welcome-empty-hint">
                最近開いたファイルやフォルダはありません
              </div>
            ) : (
              <div className="welcome-recent-list">
                {recentItems.map((item) => (
                  <div
                    key={item.path}
                    className="welcome-recent-item"
                    onClick={() => onSelectRecent(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectRecent(item);
                      }
                    }}
                  >
                    <div className="welcome-recent-info">
                      <span className="welcome-recent-icon">
                        {item.isDir ? '📁' : '📄'}
                      </span>
                      <div className="welcome-recent-texts">
                        <span className="welcome-recent-name">{item.name}</span>
                        <span className="welcome-recent-path" title={item.path}>
                          {item.path}
                        </span>
                      </div>
                    </div>
                    <div className="welcome-recent-meta">
                      <span className="welcome-recent-time">
                        {formatRelativeTime(item.timestamp)}
                      </span>
                      {onRemoveRecent && (
                        <button
                          type="button"
                          className="welcome-recent-del"
                          title="履歴から削除"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveRecent(item.path);
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 右カード: キーボードショートカット */}
          <div className="welcome-card">
            <div className="welcome-card-header">
              <div className="welcome-card-title">
                <span>⌨️</span>
                <span>キーボードショートカット</span>
              </div>
            </div>

            <div className="welcome-shortcut-list">
              <div className="welcome-shortcut-row">
                <span className="welcome-shortcut-label">クイックオープン</span>
                <div className="welcome-shortcut-keys">
                  <kbd className="welcome-key">Ctrl</kbd>
                  <span>+</span>
                  <kbd className="welcome-key">P</kbd>
                </div>
              </div>

              <div className="welcome-shortcut-row">
                <span className="welcome-shortcut-label">ファイルを開く</span>
                <div className="welcome-shortcut-keys">
                  <kbd className="welcome-key">Ctrl</kbd>
                  <span>+</span>
                  <kbd className="welcome-key">O</kbd>
                </div>
              </div>

              <div className="welcome-shortcut-row">
                <span className="welcome-shortcut-label">サイドバー開閉</span>
                <div className="welcome-shortcut-keys">
                  <kbd className="welcome-key">Ctrl</kbd>
                  <span>+</span>
                  <kbd className="welcome-key">B</kbd>
                </div>
              </div>

              <div className="welcome-shortcut-row">
                <span className="welcome-shortcut-label">ファイル内検索</span>
                <div className="welcome-shortcut-keys">
                  <kbd className="welcome-key">Ctrl</kbd>
                  <span>+</span>
                  <kbd className="welcome-key">F</kbd>
                </div>
              </div>

              <div className="welcome-shortcut-row">
                <span className="welcome-shortcut-label">タブを閉じる</span>
                <div className="welcome-shortcut-keys">
                  <kbd className="welcome-key">Ctrl</kbd>
                  <span>+</span>
                  <kbd className="welcome-key">W</kbd>
                </div>
              </div>

              <div className="welcome-shortcut-row">
                <span className="welcome-shortcut-label">ペインを左右分割</span>
                <div className="welcome-shortcut-keys">
                  <kbd className="welcome-key">Ctrl</kbd>
                  <span>+</span>
                  <kbd className="welcome-key">\</kbd>
                </div>
              </div>

              <div className="welcome-shortcut-row">
                <span className="welcome-shortcut-label">全画面表示切替</span>
                <div className="welcome-shortcut-keys">
                  <kbd className="welcome-key">F11</kbd>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* フッター: ドラッグ＆ドロップヒント */}
        <div className="welcome-drop-hint">
          <span>💡</span>
          <span>ここに .md ファイルをドラッグ＆ドロップして開く</span>
        </div>
      </div>
    </div>
  );
};
