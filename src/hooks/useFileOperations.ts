import { useState, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openWithDefaultSize } from '../utils/dialog';
import type { PaneItem, TabItem } from '../types';
import { generateId } from '../utils/id';
import { findTabByPath } from '../utils/tab';
import {
  isMarkdownFile,
  getParentDirPath,
  getPathBaseName,
  isSubpathOf,
  normalizePath,
} from '../utils/path';
import { isDraggingTab } from '../utils/dragState';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface UseFileOperationsOptions {
  panes: PaneItem[];
  activePaneId: string;
  setActivePaneId: (id: string) => void;
  addTabToPane: (paneId: string, tab: TabItem) => void;
  handleSelectTab: (paneId: string, tabId: string) => void;
  folderPath: string | null;
  setFolderPath: (path: string) => void;
  setFolderName: (name: string) => void;
  setIsSidebarOpen: (isOpen: boolean) => void;
  loadDirectory: (path: string) => Promise<void>;
  scrollToAnchor: (hash: string, paneId?: string) => void;
  onError?: (msg: string) => void;
}

export function useFileOperations({
  panes,
  activePaneId,
  setActivePaneId,
  addTabToPane,
  handleSelectTab,
  folderPath,
  setFolderPath,
  setFolderName,
  setIsSidebarOpen,
  loadDirectory,
  scrollToAnchor,
  onError,
}: UseFileOperationsOptions) {
  const [isDragging, setIsDragging] = useState(false);

  // ファイルを選択して指定ペインに表示
  const handleSelectFile = useCallback(
    async (
      path: string,
      initialHash?: string | null,
      targetPaneId?: string,
      forceNew?: boolean
    ) => {
      const targetId = targetPaneId || activePaneId;
      const targetPane = panes.find((p) => p.id === targetId);

      // 対象ペインに既に開かれているファイルの場合は新規追加せず既存タブを選択（forceNew時はスキップして新規タブを開く）
      if (!forceNew && targetPane) {
        const normPath = normalizePath(path);
        const existingTab = targetPane.tabs.find(
          (t) => normalizePath(t.filePath) === normPath
        );

        if (existingTab) {
          handleSelectTab(targetId, existingTab.id);
          setActivePaneId(targetId);

          if (initialHash) {
            setTimeout(() => {
              scrollToAnchor(initialHash, targetId);
            }, 100);
          }
          return;
        }
      }

      try {
        const [filePath, text] = await invoke<[string, string]>('read_md_file', { path });
        const filename = getPathBaseName(filePath) || 'Untitled';

        const newTab: TabItem = {
          id: generateId(),
          filePath,
          fileName: filename,
          content: text,
        };

        addTabToPane(targetId, newTab);
        setActivePaneId(targetId);

        if (initialHash) {
          setTimeout(() => {
            scrollToAnchor(initialHash, targetId);
          }, 100);
        }
      } catch (err: unknown) {
        onError?.(typeof err === 'string' ? err : 'ファイルの読み込みに失敗しました。');
      }
    },
    [activePaneId, addTabToPane, handleSelectTab, panes, scrollToAnchor, setActivePaneId, onError]
  );

  const handleDropFile = useCallback(
    (filePath: string, targetPaneId: string) => {
      handleSelectFile(filePath, null, targetPaneId);
    },
    [handleSelectFile]
  );

  // クイックオープンからのファイル選択処理（既存タブがあれば切り替え、なければ新規オープン）
  const handleQuickOpenFile = useCallback(
    (targetFilePath: string) => {
      const found = findTabByPath(panes, targetFilePath);
      if (found) {
        setActivePaneId(found.paneId);
        handleSelectTab(found.paneId, found.tab.id);
        return;
      }
      handleSelectFile(targetFilePath);
    },
    [panes, setActivePaneId, handleSelectTab, handleSelectFile]
  );

  // 全ペインで開かれている全タブの一覧（クイックオープン候補用）
  const allOpenTabs = useMemo(() => {
    const list: { filePath: string; fileName: string }[] = [];
    const seen = new Set<string>();
    for (const p of panes) {
      for (const t of p.tabs) {
        const norm = normalizePath(t.filePath);
        if (!seen.has(norm)) {
          seen.add(norm);
          list.push({ filePath: t.filePath, fileName: t.fileName });
        }
      }
    }
    return list;
  }, [panes]);

  // 単一の「ファイルを開く」ハンドラ
  const handleOpenFile = useCallback(async () => {
    if (!isTauri) {
      onError?.(
        'この機能はデスクトップアプリ環境でのみ動作します。ファイルをドラッグ＆ドロップしてください。'
      );
      return;
    }
    try {
      const selected = await openWithDefaultSize({
        multiple: false,
        directory: false,
        title: 'Markdownファイルを選択',
        filters: [{
          name: 'Markdown',
          extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx'],
        }],
      });
      if (!selected) return;
      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (!selectedPath) return;

      const [path, text] = await invoke<[string, string]>('read_md_file', { path: selectedPath });
      const filename = getPathBaseName(path) || 'Untitled';

      const targetPane = panes.find((p) => p.id === activePaneId);
      const normPath = normalizePath(path);
      const existingTab = targetPane?.tabs.find(
        (t) => normalizePath(t.filePath) === normPath
      );

      if (existingTab) {
        handleSelectTab(activePaneId, existingTab.id);
      } else {
        const newTab: TabItem = {
          id: generateId(),
          filePath: path,
          fileName: filename,
          content: text,
        };

        addTabToPane(activePaneId, newTab);
      }

      // 親ディレクトリの自動判定とサイドバー読み込み
      const parentDir = getParentDirPath(path);
      const parentDirName = parentDir ? getPathBaseName(parentDir) : null;
      const isAlreadyInFolder = folderPath ? isSubpathOf(path, folderPath) : false;

      if (!isAlreadyInFolder && parentDir && parentDirName) {
        setFolderPath(parentDir);
        setFolderName(parentDirName);
        setIsSidebarOpen(true);
        await loadDirectory(parentDir);
      }
    } catch (err: unknown) {
      onError?.(typeof err === 'string' ? err : 'ファイルの選択に失敗しました。');
    }
  }, [
    activePaneId,
    addTabToPane,
    folderPath,
    handleSelectTab,
    loadDirectory,
    panes,
    setFolderName,
    setFolderPath,
    setIsSidebarOpen,
    onError,
  ]);

  // ドラッグ関連ハンドラ
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // タブのDnD中または内部JSONデータの場合はファイルドロップオーバーレイを表示しない
    if (isDraggingTab() || e.dataTransfer.types.includes('application/json')) return;
    // 外部ファイルのドラッグの場合のみオーバーレイを表示
    if (!e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes('text/plain')) return;
    // タブのドラッグ（text/plainに内部JSONが入っている）は除外
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // タブのDnD中はApp.tsxレベルのDragOverをブロックしない（MarkdownPane/TabBarのドロップが機能するように）
    if (isDraggingTab() || e.dataTransfer.types.includes('application/json')) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }, []);


  // ファイル/フォルダがドロップされた時の処理
  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      // タブのDnD中（内部転送）はファイルドロップとして処理しない
      if (isDraggingTab()) return;
      if (e.dataTransfer.types.includes('application/json')) return;

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      if (!isMarkdownFile(file.name)) {
        onError?.('Markdown (.md, .markdown) ファイルをドロップしてください。');
        return;
      }

      try {
        // Tauri環境ではfile.pathからファイルパスを取得してread_md_fileで正規化されたHTMLを取得
        const droppedPath = (file as unknown as { path?: string }).path || '';
        if (isTauri && droppedPath) {
          const [filePath, text] = await invoke<[string, string]>('read_md_file', { path: droppedPath });
          const filename = getPathBaseName(filePath) || file.name;
          const newTab: TabItem = {
            id: generateId(),
            filePath,
            fileName: filename,
            content: text,
            isStandalone: true,
          };
          addTabToPane(activePaneId, newTab);
        } else {
          // 非Tauri環境フォールバック
          const text = await file.text();
          const html = await invoke<string>('parse_markdown', { md: text });
          const newTab: TabItem = {
            id: generateId(),
            filePath: droppedPath,
            fileName: file.name,
            content: html,
            isStandalone: true,
          };
          addTabToPane(activePaneId, newTab);
        }
      } catch {
        onError?.('ファイルの読み込みに失敗しました。');
      }
    },
    [activePaneId, addTabToPane, onError]
  );

  return {
    isDragging,
    handleSelectFile,
    handleDropFile,
    handleQuickOpenFile,
    handleOpenFile,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    allOpenTabs,
  };
}
