import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { PaneItem, TabItem, SavedSession, SavedPaneSession } from '../types';
import { getPathBaseName } from '../utils/path';

const SESSION_STORAGE_KEY = 'feathermark_saved_session';
const RESTORE_SETTINGS_KEY = 'feathermark_restore_session_setting';

interface UseSessionOptions {
  folderPath: string | null;
  folderName: string | null;
  panes: PaneItem[];
  activePaneId: string;
  isSidebarOpen: boolean;
  setFolderPath: (path: string | null) => void;
  setFolderName: (name: string | null) => void;
  setIsSidebarOpen: (isOpen: boolean) => void;
  setPanes: React.Dispatch<React.SetStateAction<PaneItem[]>>;
  setActivePaneId: (paneId: string) => void;
  loadDirectory: (path: string) => Promise<void>;
  onError?: (msg: string) => void;
}

export function useSession({
  folderPath,
  folderName,
  panes,
  activePaneId,
  isSidebarOpen,
  setFolderPath,
  setFolderName,
  setIsSidebarOpen,
  setPanes,
  setActivePaneId,
  loadDirectory,
  onError,
}: UseSessionOptions) {
  // 起動時のセッション復元設定 (デフォルト: true)
  const [restoreSessionOnStartup, setRestoreSessionOnStartupState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = localStorage.getItem(RESTORE_SETTINGS_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const handleRestoreSessionSettingChange = useCallback((enabled: boolean) => {
    setRestoreSessionOnStartupState(enabled);
    try {
      localStorage.setItem(RESTORE_SETTINGS_KEY, String(enabled));
    } catch {
      // ignore
    }
  }, []);

  // セッション復元済みフラグ（二重復元防止）
  const isRestoredRef = useRef<boolean>(false);
  // 初期ロード中フラグ（復元処理中の自動保存による空状態上書き防止）
  const isInitializingRef = useRef<boolean>(true);

  // 最新状態を常に参照できるように ref で保持
  const currentStateRef = useRef({
    folderPath,
    folderName,
    panes,
    activePaneId,
    isSidebarOpen,
  });

  useEffect(() => {
    currentStateRef.current = {
      folderPath,
      folderName,
      panes,
      activePaneId,
      isSidebarOpen,
    };
  }, [folderPath, folderName, panes, activePaneId, isSidebarOpen]);

  // セッションの保存処理
  const saveSession = useCallback(() => {
    if (isInitializingRef.current || typeof window === 'undefined') return;

    try {
      const state = currentStateRef.current;
      // 仮想タブ（Diff等）を除外した保存用ペインデータの作成
      const savedPanes: SavedPaneSession[] = state.panes.map((pane) => ({
        id: pane.id,
        activeTabId: pane.activeTabId,
        tabs: pane.tabs
          .filter((tab) => !tab.isDiff && !tab.isGitDiff && tab.filePath)
          .map((tab) => ({
            id: tab.id,
            filePath: tab.filePath,
            fileName: tab.fileName || getPathBaseName(tab.filePath) || 'Untitled',
            scrollTop: tab.scrollTop,
            isStandalone: tab.isStandalone,
          })),
      }));

      const session: SavedSession = {
        version: 1,
        folderPath: state.folderPath,
        folderName: state.folderName,
        panes: savedPanes,
        activePaneId: state.activePaneId,
        isSidebarOpen: state.isSidebarOpen,
        timestamp: Date.now(),
      };

      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
      console.warn('Failed to save session to localStorage:', e);
    }
  }, []);

  // 状態変更時のデバウンス自動保存
  useEffect(() => {
    if (isInitializingRef.current) return;

    const timer = setTimeout(() => {
      saveSession();
    }, 800);

    return () => clearTimeout(timer);
  }, [folderPath, folderName, panes, activePaneId, isSidebarOpen, saveSession]);

  // アプリ終了・リロード直前の同期保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveSession();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveSession]);

  // セッション復元処理
  const restoreSession = useCallback(async (): Promise<boolean> => {
    if (isRestoredRef.current) return false;
    isRestoredRef.current = true;

    if (!restoreSessionOnStartup || typeof window === 'undefined') {
      isInitializingRef.current = false;
      return false;
    }

    let savedSession: SavedSession | null = null;
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        savedSession = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Failed to parse saved session:', e);
    }

    if (!savedSession || !savedSession.panes || savedSession.panes.length === 0) {
      isInitializingRef.current = false;
      return false;
    }

    try {
      // 1. ワークスペースフォルダの復元
      if (savedSession.folderPath) {
        setFolderPath(savedSession.folderPath);
        setFolderName(savedSession.folderName || getPathBaseName(savedSession.folderPath));
        loadDirectory(savedSession.folderPath).catch((err) => {
          console.warn('Failed to restore workspace directory:', err);
        });
      }

      // 2. サイドバー開閉状態の復元
      if (typeof savedSession.isSidebarOpen === 'boolean') {
        setIsSidebarOpen(savedSession.isSidebarOpen);
      }

      // 3. 各ペインのタブコンテンツを安全に読み込み復元
      const restoredPanes: PaneItem[] = [];

      for (const savedPane of savedSession.panes) {
        const restoredTabs: TabItem[] = [];

        for (const savedTab of savedPane.tabs) {
          if (!savedTab.filePath) continue;
          try {
            const [filePath, content] = await invoke<[string, string]>('read_md_file', {
              path: savedTab.filePath,
            });

            restoredTabs.push({
              id: savedTab.id,
              filePath,
              fileName: savedTab.fileName || getPathBaseName(filePath) || 'Untitled',
              content,
              scrollTop: savedTab.scrollTop,
              isStandalone: savedTab.isStandalone,
            });
          } catch {
            // ファイルが削除・移動されていた場合はスキップ
            console.info(`Skipped non-existent file during session restore: ${savedTab.filePath}`);
          }
        }

        // 有効なアクティブタブIDを決定
        let activeTabId: string | null = null;
        if (restoredTabs.length > 0) {
          const hasSavedActive = restoredTabs.some((t) => t.id === savedPane.activeTabId);
          activeTabId = hasSavedActive ? savedPane.activeTabId : restoredTabs[0].id;
        }

        restoredPanes.push({
          id: savedPane.id,
          tabs: restoredTabs,
          activeTabId,
        });
      }

      if (restoredPanes.length > 0 && restoredPanes.some((p) => p.tabs.length > 0)) {
        setPanes(restoredPanes);
        const validActivePaneId = restoredPanes.some((p) => p.id === savedSession?.activePaneId)
          ? savedSession.activePaneId
          : restoredPanes[0].id;
        setActivePaneId(validActivePaneId);

        // スクロール位置の反映（レンダリング完了後に適用）
        setTimeout(() => {
          restoredPanes.forEach((pane) => {
            const activeTab = pane.tabs.find((t) => t.id === pane.activeTabId);
            if (activeTab && activeTab.scrollTop && activeTab.scrollTop > 0) {
              const el = document.querySelector(`[data-pane-id="${pane.id}"] .markdown-body`);
              if (el) {
                el.scrollTop = activeTab.scrollTop;
              }
            }
          });
        }, 150);

        isInitializingRef.current = false;
        return true;
      }
    } catch (err) {
      console.error('Error during session restore:', err);
      onError?.('セッションの復元中に一部エラーが発生しました。');
    }

    isInitializingRef.current = false;
    return false;
  }, [
    restoreSessionOnStartup,
    setFolderPath,
    setFolderName,
    loadDirectory,
    setIsSidebarOpen,
    setPanes,
    setActivePaneId,
    onError,
  ]);

  return {
    restoreSessionOnStartup,
    handleRestoreSessionSettingChange,
    restoreSession,
    saveSession,
    isInitializingRef,
  };
}
