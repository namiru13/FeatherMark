import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { PaneItem, TabItem } from '../types';
import { generateId } from '../utils/id';
import { normalizePath } from '../utils/path';
import { getNextActiveTabId, getTabByIndex } from '../utils/tab';
import { MIN_PANE_WIDTH } from '../constants/layout';

/** 閉じたタブの履歴保持上限 */
const MAX_CLOSED_TABS_HISTORY = 10;

/** 
 * 閉じたタブの復元用メタデータ
 * content（パース済みHTML）やdiffResult等の巨大データを除外してメモリ消費を極力抑える
 */
export interface ClosedTabMetadata {
  filePath: string;
  fileName: string;
  scrollTop?: number;
  isStandalone?: boolean;
  isDiff?: boolean;
  isGitDiff?: boolean;
  gitRevision?: string;
  gitFilePath?: string;
  diffViewMode?: TabItem['diffViewMode'];
}

/** 閉じたタブの履歴エントリ */
interface ClosedTabEntry {
  metadata: ClosedTabMetadata;
  paneId: string;
}

export function usePanes() {
  const [panes, setPanes] = useState<PaneItem[]>([{ id: 'pane-1', tabs: [], activeTabId: null }]);
  const [activePaneId, setActivePaneId] = useState<string>('pane-1');
  const [closedTabsHistory, setClosedTabsHistory] = useState<ClosedTabEntry[]>([]);

  // ペインコンテナのDOM参照と実効幅の監視
  const panesContainerRef = useRef<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  useEffect(() => {
    const updateWidth = () => {
      if (panesContainerRef.current) {
        setContainerWidth(panesContainerRef.current.clientWidth);
      } else if (typeof window !== 'undefined') {
        setContainerWidth(window.innerWidth);
      }
    };

    updateWidth();

    const el = panesContainerRef.current;
    let observer: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect) {
            setContainerWidth(entry.contentRect.width);
          }
        }
      });
      observer.observe(el);
    }

    window.addEventListener('resize', updateWidth);

    return () => {
      if (observer) {
        observer.disconnect();
      }
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  // 画面幅（コンテナ幅）に基づいてこれ以上分割可能か判定
  const canSplit = useMemo(() => {
    const effectiveWidth =
      containerWidth > 0 ? containerWidth : typeof window !== 'undefined' ? window.innerWidth : 1200;
    return (panes.length + 1) * MIN_PANE_WIDTH <= effectiveWidth;
  }, [containerWidth, panes.length]);

  // ペインのファイルが0になったらペインを閉じるかの設定
  const [autoCloseEmptyPane, setAutoCloseEmptyPane] = useState<boolean>(() => {
    const saved = localStorage.getItem('markdown_auto_close_empty_pane');
    return saved === 'true'; // デフォルトはfalse。保存されていればそれに従う
  });

  const handleAutoCloseEmptyPaneChange = useCallback((value: boolean) => {
    setAutoCloseEmptyPane(value);
    localStorage.setItem('markdown_auto_close_empty_pane', String(value));
  }, []);

  // ペインにタブを追加
  const addTabToPane = useCallback((paneId: string, tab: TabItem) => {
    setPanes((prev) =>
      prev.map((pane) => {
        if (pane.id === paneId) {
          return {
            ...pane,
            tabs: [...pane.tabs, tab],
            activeTabId: tab.id,
          };
        }
        return pane;
      })
    );
  }, []);

  // タブ選択
  const handleSelectTab = useCallback((paneId: string, tabId: string) => {
    setPanes((prev) =>
      prev.map((pane) => {
        if (pane.id === paneId) {
          return { ...pane, activeTabId: tabId };
        }
        return pane;
      })
    );
    setActivePaneId(paneId);
  }, []);

  // ペインを閉じる
  const handleClosePane = useCallback(
    (paneId: string) => {
      setPanes((prev) => {
        if (prev.length <= 1) return prev; // 最後の1ペインは閉じない
        const remaining = prev.filter((p) => p.id !== paneId);
        setActivePaneId((currentActive) => {
          if (currentActive === paneId) {
            return remaining.length > 0 ? remaining[remaining.length - 1].id : currentActive;
          }
          return currentActive;
        });
        return remaining;
      });
    },
    []
  );

  // タブを閉じる
  const handleCloseTab = useCallback(
    (paneId: string, tabId: string) => {
      const currentPane = panes.find((p) => p.id === paneId);
      if (!currentPane) return;

      // 閉じるタブを履歴に保存（復元用: content等の巨大データは持たずメタデータのみ保存してメモリ解放）
      const closingTab = currentPane.tabs.find((t) => t.id === tabId);
      if (closingTab) {
        const metadata: ClosedTabMetadata = {
          filePath: closingTab.filePath,
          fileName: closingTab.fileName,
          scrollTop: closingTab.scrollTop,
          isStandalone: closingTab.isStandalone,
          isDiff: closingTab.isDiff,
          isGitDiff: closingTab.isGitDiff,
          gitRevision: closingTab.gitRevision,
          gitFilePath: closingTab.gitFilePath,
          diffViewMode: closingTab.diffViewMode,
        };
        setClosedTabsHistory((prev) => {
          const newHistory = [{ metadata, paneId }, ...prev];
          return newHistory.slice(0, MAX_CLOSED_TABS_HISTORY);
        });
      }

      const newTabs = currentPane.tabs.filter((t) => t.id !== tabId);

      if (newTabs.length === 0 && panes.length >= 2 && autoCloseEmptyPane) {
        handleClosePane(paneId);
        return;
      }

      setPanes((prev) =>
        prev.map((pane) => {
          if (pane.id === paneId) {
            const newActiveTabId = getNextActiveTabId(pane.tabs, tabId, pane.activeTabId);
            return { ...pane, tabs: newTabs, activeTabId: newActiveTabId };
          }
          return pane;
        })
      );
    },
    [panes, autoCloseEmptyPane, handleClosePane]
  );

  // 他のタブをすべて閉じる
  const handleCloseOtherTabs = useCallback((paneId: string, tabId: string) => {
    setPanes((prev) =>
      prev.map((pane) => {
        if (pane.id === paneId) {
          const targetTab = pane.tabs.find((t) => t.id === tabId);
          return {
            ...pane,
            tabs: targetTab ? [targetTab] : [],
            activeTabId: targetTab ? targetTab.id : null,
          };
        }
        return pane;
      })
    );
  }, []);

  // 右側のタブを閉じる
  const handleCloseTabsToRight = useCallback((paneId: string, tabId: string) => {
    setPanes((prev) =>
      prev.map((pane) => {
        if (pane.id === paneId) {
          const targetIndex = pane.tabs.findIndex((t) => t.id === tabId);
          if (targetIndex === -1) return pane;
          const remainingTabs = pane.tabs.slice(0, targetIndex + 1);
          let newActiveId = pane.activeTabId;
          if (!remainingTabs.some((t) => t.id === newActiveId)) {
            newActiveId = tabId;
          }
          return {
            ...pane,
            tabs: remainingTabs,
            activeTabId: newActiveId,
          };
        }
        return pane;
      })
    );
  }, []);

  // ペインを右に分割
  const handleSplitPane = useCallback(
    (paneId: string) => {
      // 画面幅に基づく最小ペイン幅チェック（安全ガード）
      const effectiveWidth =
        containerWidth > 0 ? containerWidth : typeof window !== 'undefined' ? window.innerWidth : 1200;
      if ((panes.length + 1) * MIN_PANE_WIDTH > effectiveWidth) return;

      const currentPane = panes.find((p) => p.id === paneId);
      if (!currentPane) return;

      const newPaneId = `pane-${generateId()}`;
      // 現在のペインのアクティブタブをコピーして新しいペインを作成
      const activeTab = currentPane.tabs.find((t) => t.id === currentPane.activeTabId);
      const newTabs: TabItem[] = [];
      let newActiveTabId: string | null = null;

      if (activeTab) {
        const clonedTab = { ...activeTab, id: generateId() };
        newTabs.push(clonedTab);
        newActiveTabId = clonedTab.id;
      }

      const paneIndex = panes.findIndex((p) => p.id === paneId);
      const newPanes = [...panes];
      newPanes.splice(paneIndex + 1, 0, {
        id: newPaneId,
        tabs: newTabs,
        activeTabId: newActiveTabId,
      });
      setPanes(newPanes);
      setActivePaneId(newPaneId);
    },
    [panes, containerWidth]
  );

  // ペイン間でタブを移動（ゼロコピー: 既存TabItemオブジェクトの参照をそのまま移送し、追加メモリ確保や再パースを回避）
  const handleMoveTab = useCallback(
    (sourcePaneId: string, tabId: string, targetPaneId: string, targetIndex?: number) => {
      // 同一ペイン内の並び替え処理
      if (sourcePaneId === targetPaneId) {
        if (targetIndex === undefined) return;
        setPanes((prev) =>
          prev.map((pane) => {
            if (pane.id === sourcePaneId) {
              const oldIndex = pane.tabs.findIndex((t) => t.id === tabId);
              if (oldIndex === -1 || oldIndex === targetIndex || targetIndex === oldIndex + 1) return pane;
              const newTabs = [...pane.tabs];
              const [movedTab] = newTabs.splice(oldIndex, 1);
              const insertIndex = targetIndex > oldIndex ? targetIndex - 1 : targetIndex;
              newTabs.splice(Math.max(0, Math.min(insertIndex, newTabs.length)), 0, movedTab);
              return { ...pane, tabs: newTabs };
            }
            return pane;
          })
        );
        return;
      }

      const sourcePane = panes.find((p) => p.id === sourcePaneId);
      const tabToMove = sourcePane?.tabs.find((t) => t.id === tabId);
      if (!tabToMove) return;

      const sourceNewTabs = sourcePane!.tabs.filter((t) => t.id !== tabId);

      // 移動元ペインが空になり、かつ autoCloseEmptyPane が true の場合
      if (sourceNewTabs.length === 0 && panes.length >= 2 && autoCloseEmptyPane) {
        setPanes((prev) => {
          let newPanes = prev.filter((p) => p.id !== sourcePaneId);
          newPanes = newPanes.map((p) => {
            if (p.id === targetPaneId) {
              const newTabs = [...p.tabs];
              const insertIdx = targetIndex !== undefined ? Math.max(0, Math.min(targetIndex, newTabs.length)) : newTabs.length;
              newTabs.splice(insertIdx, 0, tabToMove);
              return {
                ...p,
                tabs: newTabs,
                activeTabId: tabToMove.id,
              };
            }
            return p;
          });
          return newPanes;
        });
        setActivePaneId(targetPaneId);
        return;
      }

      setPanes((prev) => {
        let newPanes = [...prev];

        // 移動元から除外
        newPanes = newPanes.map((p) => {
          if (p.id === sourcePaneId) {
            const newTabs = p.tabs.filter((t) => t.id !== tabId);
            const newActiveTabId = getNextActiveTabId(p.tabs, tabId, p.activeTabId);
            return { ...p, tabs: newTabs, activeTabId: newActiveTabId };
          }
          return p;
        });

        // 移動先に追加
        newPanes = newPanes.map((p) => {
          if (p.id === targetPaneId) {
            const newTabs = [...p.tabs];
            const insertIdx = targetIndex !== undefined ? Math.max(0, Math.min(targetIndex, newTabs.length)) : newTabs.length;
            newTabs.splice(insertIdx, 0, tabToMove);
            return {
              ...p,
              tabs: newTabs,
              activeTabId: tabToMove.id,
            };
          }
          return p;
        });

        return newPanes;
      });
      setActivePaneId(targetPaneId);
    },
    [panes, autoCloseEmptyPane]
  );

  /** 指定したタブを移動させ、指定ペインの右側に新しいペインを作成して配置 */
  const splitPaneWithTab = useCallback(
    (sourcePaneId: string, tabId: string, afterPaneId: string) => {
      const effectiveWidth =
        containerWidth > 0 ? containerWidth : typeof window !== 'undefined' ? window.innerWidth : 1200;
      if ((panes.length + 1) * MIN_PANE_WIDTH > effectiveWidth) return;

      const sourcePane = panes.find((p) => p.id === sourcePaneId);
      const tabToMove = sourcePane?.tabs.find((t) => t.id === tabId);
      if (!tabToMove) return;

      const newPaneId = `pane-${generateId()}`;
      const afterIndex = panes.findIndex((p) => p.id === afterPaneId);
      if (afterIndex === -1) return;

      const sourceRemainingTabs = sourcePane!.tabs.filter((t) => t.id !== tabId);

      // 移動元ペインが空になり、かつ autoCloseEmptyPane が true の場合
      if (sourceRemainingTabs.length === 0 && panes.length >= 2 && autoCloseEmptyPane) {
        setPanes((prev) => {
          const filtered = prev.filter((p) => p.id !== sourcePaneId);
          const newIdx = filtered.findIndex((p) => p.id === afterPaneId);
          const insertPos = newIdx !== -1 ? newIdx + 1 : filtered.length;
          filtered.splice(insertPos, 0, {
            id: newPaneId,
            tabs: [tabToMove],
            activeTabId: tabToMove.id,
          });
          return filtered;
        });
        setActivePaneId(newPaneId);
        return;
      }

      setPanes((prev) => {
        const nextActiveInSource = getNextActiveTabId(sourcePane!.tabs, tabId, sourcePane!.activeTabId);
        const updated = prev.map((p) => {
          if (p.id === sourcePaneId) {
            return { ...p, tabs: sourceRemainingTabs, activeTabId: nextActiveInSource };
          }
          return p;
        });
        const currentAfterIdx = updated.findIndex((p) => p.id === afterPaneId);
        const insertPos = currentAfterIdx !== -1 ? currentAfterIdx + 1 : updated.length;
        updated.splice(insertPos, 0, {
          id: newPaneId,
          tabs: [tabToMove],
          activeTabId: tabToMove.id,
        });
        return updated;
      });
      setActivePaneId(newPaneId);
    },
    [panes, containerWidth, autoCloseEmptyPane]
  );

  /** 
   * アクティブタブを隣のペインへ移動（ショートカットキー用）
   * - 'right': 右ペインへ移動。右ペインがなく画面幅が許せば右に新規ペインを作成して移動
   * - 'left': 左ペインへ移動
   */
  const moveActiveTabToPane = useCallback(
    (direction: 'left' | 'right') => {
      const currentPaneIndex = panes.findIndex((p) => p.id === activePaneId);
      if (currentPaneIndex === -1) return;
      const currentPane = panes[currentPaneIndex];
      if (!currentPane.activeTabId) return;

      const activeTabId = currentPane.activeTabId;

      if (direction === 'right') {
        if (currentPaneIndex < panes.length - 1) {
          // 右隣のペインへ移動
          const targetPaneId = panes[currentPaneIndex + 1].id;
          handleMoveTab(activePaneId, activeTabId, targetPaneId);
        } else if (canSplit) {
          // 右側にペインがなく、かつ画面幅が許せば右に新規ペインを作成して移動
          splitPaneWithTab(activePaneId, activeTabId, activePaneId);
        }
      } else if (direction === 'left') {
        if (currentPaneIndex > 0) {
          // 左隣のペインへ移動
          const targetPaneId = panes[currentPaneIndex - 1].id;
          handleMoveTab(activePaneId, activeTabId, targetPaneId);
        }
      }
    },
    [panes, activePaneId, canSplit, handleMoveTab, splitPaneWithTab]
  );

  // --- タブナビゲーション用ヘルパー ---

  /** アクティブペインの次のタブに切り替え */
  const goToNextTab = useCallback(() => {
    const pane = panes.find((p) => p.id === activePaneId);
    if (!pane || pane.tabs.length <= 1) return;
    const currentIndex = pane.tabs.findIndex((t) => t.id === pane.activeTabId);
    const nextIndex = (currentIndex + 1) % pane.tabs.length;
    handleSelectTab(activePaneId, pane.tabs[nextIndex].id);
  }, [panes, activePaneId, handleSelectTab]);

  /** アクティブペインの前のタブに切り替え */
  const goToPrevTab = useCallback(() => {
    const pane = panes.find((p) => p.id === activePaneId);
    if (!pane || pane.tabs.length <= 1) return;
    const currentIndex = pane.tabs.findIndex((t) => t.id === pane.activeTabId);
    const prevIndex = (currentIndex - 1 + pane.tabs.length) % pane.tabs.length;
    handleSelectTab(activePaneId, pane.tabs[prevIndex].id);
  }, [panes, activePaneId, handleSelectTab]);

  /** アクティブペインのN番目のタブに切り替え（1始まり、9は最後のタブ） */
  const goToNthTab = useCallback(
    (n: number) => {
      const pane = panes.find((p) => p.id === activePaneId);
      if (!pane) return;
      const targetTab = getTabByIndex(pane.tabs, n);
      if (targetTab) {
        handleSelectTab(activePaneId, targetTab.id);
      }
    },
    [panes, activePaneId, handleSelectTab]
  );

  /** アクティブペインのアクティブタブを閉じる */
  const closeActiveTab = useCallback(() => {
    const pane = panes.find((p) => p.id === activePaneId);
    if (!pane || !pane.activeTabId) return;
    handleCloseTab(activePaneId, pane.activeTabId);
  }, [panes, activePaneId, handleCloseTab]);

  /** 最後に閉じたタブを復元（メタデータからオンデマンドで内容を再取得して復元） */
  const handleReopenClosedTab = useCallback(async () => {
    if (closedTabsHistory.length === 0) return;
    const [lastClosed, ...rest] = closedTabsHistory;
    setClosedTabsHistory(rest);

    // 復元先のペインが存在するか確認。なければアクティブペインに復元
    const targetPaneId = panes.find((p) => p.id === lastClosed.paneId)
      ? lastClosed.paneId
      : activePaneId;

    const meta = lastClosed.metadata;
    let content = '';

    // Diff仮想タブでない場合はオンデマンドでバックエンドから読み込み
    if (!meta.isDiff && !meta.isGitDiff && meta.filePath) {
      try {
        const [, text] = await invoke<[string, string]>('read_md_file', { path: meta.filePath });
        content = text;
      } catch (err) {
        console.error('閉じたタブのファイル再読込に失敗しました:', err);
      }
    }

    const restoredTab: TabItem = {
      id: generateId(),
      filePath: meta.filePath,
      fileName: meta.fileName,
      content,
      scrollTop: meta.scrollTop,
      isStandalone: meta.isStandalone,
      isDiff: meta.isDiff,
      isGitDiff: meta.isGitDiff,
      gitRevision: meta.gitRevision,
      gitFilePath: meta.gitFilePath,
      diffViewMode: meta.diffViewMode,
    };

    addTabToPane(targetPaneId, restoredTab);
    setActivePaneId(targetPaneId);
  }, [closedTabsHistory, panes, activePaneId, addTabToPane]);

  // ファイルパスに一致するタブの内容を更新（ホットリフレッシュ用）
  const reloadTabContent = useCallback((targetFilePath: string, newContent: string) => {
    const normTarget = normalizePath(targetFilePath);
    setPanes((prev) =>
      prev.map((pane) => ({
        ...pane,
        tabs: pane.tabs.map((tab) => {
          const normTabPath = normalizePath(tab.filePath);
          if (normTabPath === normTarget) {
            return { ...tab, content: newContent };
          }
          return tab;
        }),
      }))
    );
  }, []);

  // 現在のアクティブペインおよびアクティブタブの参照
  const activePane = panes.find((p) => p.id === activePaneId);
  const activeTab = activePane?.tabs.find((t) => t.id === activePane.activeTabId);

  return {
    panes,
    panesContainerRef,
    containerWidth,
    canSplit,
    activePaneId,
    setActivePaneId,
    activePane,
    activeTab,
    autoCloseEmptyPane,
    handleAutoCloseEmptyPaneChange,
    addTabToPane,
    handleSelectTab,
    handleClosePane,
    handleCloseTab,
    handleCloseOtherTabs,
    handleCloseTabsToRight,
    handleSplitPane,
    splitPaneWithTab,
    handleMoveTab,
    moveActiveTabToPane,
    handleReopenClosedTab,
    goToNextTab,
    goToPrevTab,
    goToNthTab,
    closeActiveTab,
    reloadTabContent,
  };
}
