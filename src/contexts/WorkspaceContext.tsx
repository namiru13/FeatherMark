import React, { createContext, useContext, useRef, useCallback, useEffect } from 'react';
import type { FileEntry } from '../types';
import { useWorkspace } from '../hooks/useWorkspace';

export interface WorkspaceContextValue {
  folderPath: string | null;
  folderName: string | null;
  setFolderPath: React.Dispatch<React.SetStateAction<string | null>>;
  setFolderName: React.Dispatch<React.SetStateAction<string | null>>;
  rootEntries: FileEntry[];
  isLoadingRoot: boolean;
  loadDirectory: (path: string) => Promise<void>;
  handleOpenFolder: () => Promise<void>;
  handleRefreshFolder: () => Promise<void>;
  registerOnError: (cb: (msg: string) => void) => void;
  registerOnFolderOpened: (cb: () => void) => void;
  registerOnFolderLoaded: (cb: (path: string, name: string) => void) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export interface WorkspaceProviderProps {
  children: React.ReactNode;
  onError?: (msg: string) => void;
  onFolderOpened?: () => void;
  onFolderLoaded?: (path: string, name: string) => void;
}

export function WorkspaceProvider({
  children,
  onError,
  onFolderOpened,
  onFolderLoaded,
}: WorkspaceProviderProps) {
  const onErrorRef = useRef<((msg: string) => void) | undefined>(onError);
  const onFolderOpenedRef = useRef<(() => void) | undefined>(onFolderOpened);
  const onFolderLoadedRef = useRef<((path: string, name: string) => void) | undefined>(onFolderLoaded);

  // プロップス変更時に ref を同期
  useEffect(() => {
    if (onError !== undefined) onErrorRef.current = onError;
    if (onFolderOpened !== undefined) onFolderOpenedRef.current = onFolderOpened;
    if (onFolderLoaded !== undefined) onFolderLoadedRef.current = onFolderLoaded;
  }, [onError, onFolderOpened, onFolderLoaded]);

  const registerOnError = useCallback((cb: (msg: string) => void) => {
    onErrorRef.current = cb;
  }, []);

  const registerOnFolderOpened = useCallback((cb: () => void) => {
    onFolderOpenedRef.current = cb;
  }, []);

  const registerOnFolderLoaded = useCallback((cb: (path: string, name: string) => void) => {
    onFolderLoadedRef.current = cb;
  }, []);

  const workspace = useWorkspace({
    onError: (msg) => onErrorRef.current?.(msg),
    onFolderOpened: () => onFolderOpenedRef.current?.(),
    onFolderLoaded: (path, name) => onFolderLoadedRef.current?.(path, name),
  });

  const value: WorkspaceContextValue = {
    ...workspace,
    registerOnError,
    registerOnFolderOpened,
    registerOnFolderLoaded,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspaceContext must be used within WorkspaceProvider');
  }
  return ctx;
}
