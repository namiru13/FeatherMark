import React, { useState } from 'react';
import type { TabItem } from '../../types';
import { CloseIcon, SplitPaneIcon } from '../common/Icons';
import {
  setDraggingTab,
  getDraggingTab,
} from '../../utils/dragState';

interface TabBarProps {
  paneId: string;
  tabs: TabItem[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onMoveTab?: (sourcePaneId: string, tabId: string, targetPaneId: string, targetIndex?: number) => void;
  onSplitPane?: () => void;
  onClosePane?: () => void;
  canSplit: boolean;
  canClosePane: boolean;
  isActivePane: boolean;
  onFocusPane: () => void;
  onContextMenuTab?: (e: React.MouseEvent, tab: TabItem, paneId: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  paneId,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onMoveTab,
  onSplitPane,
  onClosePane,
  canSplit,
  canClosePane,
  isActivePane,
  onFocusPane,
  onContextMenuTab,
}) => {
  // ドラッグオーバー中の挿入位置（indexと前/後、またはリスト末尾）
  const [dropTarget, setDropTarget] = useState<
    { index: number; position: 'before' | 'after' } | 'end' | null
  >(null);

  // タブアイテム上のドラッグオーバー（左半分か右半分かで挿入位置を判定）
  const handleTabDragOver = (e: React.DragEvent, index: number, targetTabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    const dragging = getDraggingTab();
    // 同一タブ自身の前後にドロップする無駄なインジケーター表示を抑制
    if (dragging && dragging.paneId === paneId && dragging.tabId === targetTabId) {
      setDropTarget(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    if (e.clientX < midX) {
      setDropTarget({ index, position: 'before' });
    } else {
      setDropTarget({ index, position: 'after' });
    }
  };

  // タブアイテム上でのドロップ
  const handleTabDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);

    const rect = e.currentTarget.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const targetIndex = e.clientX < midX ? index : index + 1;

    // 1. dragState モジュールからの高速取得
    const dragging = getDraggingTab();
    setDraggingTab(null);

    if (dragging) {
      onMoveTab?.(dragging.paneId, dragging.tabId, paneId, targetIndex);
      return;
    }

    // 2. dataTransfer からのフォールバック取得
    const rawData =
      e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
    if (!rawData) return;

    try {
      const data = JSON.parse(rawData);
      if (data.type === 'tab' && data.paneId && data.tabId) {
        onMoveTab?.(data.paneId, data.tabId, paneId, targetIndex);
      }
    } catch (err) {
      console.error('Invalid drop data on tab', err);
    }
  };

  // タブリスト余白（末尾）へのドラッグオーバー
  const handleListDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget('end');
  };

  // タブリスト余白（末尾）へのドロップ
  const handleListDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);

    const dragging = getDraggingTab();
    setDraggingTab(null);

    if (dragging) {
      onMoveTab?.(dragging.paneId, dragging.tabId, paneId, tabs.length);
      return;
    }

    const rawData =
      e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
    if (!rawData) return;

    try {
      const data = JSON.parse(rawData);
      if (data.type === 'tab' && data.paneId && data.tabId) {
        onMoveTab?.(data.paneId, data.tabId, paneId, tabs.length);
      }
    } catch (err) {
      console.error('Invalid drop data on tab list', err);
    }
  };

  // ドラッグが領域外に出た際のインジケーター解除
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropTarget(null);
    }
  };

  return (
    <div className={`tab-bar ${isActivePane ? 'active-pane' : ''}`} onClick={onFocusPane}>
      <div
        className={`tab-list ${dropTarget === 'end' ? 'drop-target-end' : ''}`}
        onDragOver={handleListDragOver}
        onDrop={handleListDrop}
        onDragLeave={handleDragLeave}
      >
        {tabs.map((tab, index) => {
          const isDropBefore =
            dropTarget &&
            typeof dropTarget === 'object' &&
            dropTarget.index === index &&
            dropTarget.position === 'before';
          const isDropAfter =
            dropTarget &&
            typeof dropTarget === 'object' &&
            dropTarget.index === index &&
            dropTarget.position === 'after';

          return (
            <div
              key={tab.id}
              className={`tab-item ${tab.id === activeTabId ? 'active' : ''} ${
                isDropBefore ? 'drop-target-before' : ''
              } ${isDropAfter ? 'drop-target-after' : ''}`}
              draggable
              onDragStart={(e) => {
                const payload = JSON.stringify({ type: 'tab', paneId, tabId: tab.id });
                setDraggingTab({ paneId, tabId: tab.id });
                e.dataTransfer.setData('text/plain', payload);
                e.dataTransfer.setData('application/json', payload);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                setDraggingTab(null);
                setDropTarget(null);
              }}
              onDragOver={(e) => handleTabDragOver(e, index, tab.id)}
              onDrop={(e) => handleTabDrop(e, index)}
              onClick={(e) => {
                e.stopPropagation();
                onFocusPane();
                onSelectTab(tab.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onFocusPane();
                onContextMenuTab?.(e, tab, paneId);
              }}
              onMouseDown={(e) => {
                // マウス中ボタン（ホイールクリック）のデフォルト動作を抑制
                if (e.button === 1) {
                  e.preventDefault();
                }
              }}
              onAuxClick={(e) => {
                // マウス中ボタン（ホイールクリック）でタブを閉じる
                if (e.button === 1) {
                  e.preventDefault();
                  e.stopPropagation();
                  onFocusPane();
                  onCloseTab(tab.id);
                }
              }}
              title={tab.filePath}
            >
              <span className="tab-title">{tab.fileName}</span>
              <button
                type="button"
                className="tab-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onFocusPane();
                  onCloseTab(tab.id);
                }}
                title="閉じる"
              >
                <CloseIcon />
              </button>
            </div>
          );
        })}
      </div>
      <div className="tab-actions">
        {onSplitPane && (
          <button
            type="button"
            className={`pane-action-btn ${!canSplit ? 'disabled' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (canSplit) {
                onSplitPane();
              }
            }}
            disabled={!canSplit}
            title={canSplit ? '右に分割' : '画面幅が不足しているためこれ以上分割できません（1ペインあたり最小300px）'}
            aria-disabled={!canSplit}
          >
            <SplitPaneIcon />
          </button>
        )}
        {canClosePane && onClosePane && (
          <button type="button" className="pane-action-btn" onClick={(e) => { e.stopPropagation(); onClosePane(); }} title="ペインを閉じる">
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  );
};
