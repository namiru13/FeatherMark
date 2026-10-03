import { useEffect, useCallback } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { TabItem } from '../types';
import { isSubpathOf } from '../utils/path';

interface UseWindowTitleProps {
  activeTab?: TabItem | null;
  folderName: string | null;
  folderPath: string | null;
}

export function useWindowTitle({ activeTab, folderName, folderPath }: UseWindowTitleProps) {
  const updateTitle = useCallback((title: string) => {
    document.title = title;
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        getCurrentWebviewWindow().setTitle(title).catch((err) => {
          console.error('ウィンドウタイトルの更新に失敗:', err);
        });
      } catch (err) {
        console.error('ウィンドウインスタンスの取得に失敗:', err);
      }
    }
  }, []);

  const isTabInOpenedFolder = Boolean(
    folderName &&
    folderPath &&
    activeTab &&
    !activeTab.isStandalone &&
    activeTab.filePath &&
    isSubpathOf(activeTab.filePath, folderPath)
  );

  useEffect(() => {
    let title: string;
    if (activeTab) {
      if (isTabInOpenedFolder && folderName) {
        title = `${activeTab.fileName} - ${folderName} - FeatherMark`;
      } else {
        title = `${activeTab.fileName} - FeatherMark`;
      }
    } else if (folderName) {
      title = `${folderName} - FeatherMark`;
    } else {
      title = 'FeatherMark';
    }

    updateTitle(title);
  }, [activeTab, folderName, isTabInOpenedFolder, updateTitle]);
}
