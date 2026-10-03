import { useState, useCallback, useMemo } from 'react';
import type { RecentItem } from '../types';
import { normalizePath } from '../utils/path';

const STORAGE_KEY = 'feathermark_recent_items';
const MAX_RECENT_ITEMS = 20;

export interface RecentItemInput {
  path: string;
  name: string;
  isDir: boolean;
}

export function useRecentItems() {
  const [recentItems, setRecentItems] = useState<RecentItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is RecentItem =>
            item &&
            typeof item.path === 'string' &&
            typeof item.name === 'string' &&
            typeof item.isDir === 'boolean' &&
            typeof item.timestamp === 'number'
        );
      }
    } catch (e) {
      console.warn('Failed to load recent items from localStorage:', e);
    }
    return [];
  });

  const saveItems = useCallback((items: RecentItem[]) => {
    setRecentItems(items);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('Failed to save recent items to localStorage:', e);
    }
  }, []);

  const addRecentItem = useCallback(
    ({ path, name, isDir }: RecentItemInput) => {
      if (!path) return;
      setRecentItems((prev) => {
        const normTarget = normalizePath(path);
        const filtered = prev.filter((item) => normalizePath(item.path) !== normTarget);
        const newItem: RecentItem = {
          path,
          name,
          isDir,
          timestamp: Date.now(),
        };
        const updated = [newItem, ...filtered].slice(0, MAX_RECENT_ITEMS);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
          console.warn('Failed to save recent items to localStorage:', e);
        }
        return updated;
      });
    },
    []
  );

  const removeRecentItem = useCallback(
    (targetPath: string) => {
      const normTarget = normalizePath(targetPath);
      setRecentItems((prev) => {
        const updated = prev.filter((item) => normalizePath(item.path) !== normTarget);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
          console.warn('Failed to save recent items to localStorage:', e);
        }
        return updated;
      });
    },
    []
  );

  const clearRecentItems = useCallback(() => {
    saveItems([]);
  }, [saveItems]);

  const recentFiles = useMemo(() => recentItems.filter((i) => !i.isDir), [recentItems]);
  const recentFolders = useMemo(() => recentItems.filter((i) => i.isDir), [recentItems]);

  return {
    recentItems,
    recentFiles,
    recentFolders,
    allRecent: recentItems,
    addRecentItem,
    removeRecentItem,
    clearRecentItems,
  };
}
