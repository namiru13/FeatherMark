import { useState, useEffect, useCallback } from 'react';
import type { TocItem } from '../types';
import { extractTocItems, getHeadingId } from '../utils/toc';

interface UseTocOptions {
  activeContent: string | undefined;
  activePaneId: string;
}

/**
 * アクティブペインのMarkdown見出し（H1〜H6）の抽出と、
 * スクロール位置に応じた現在地ハイライト、クリックによるスムーズスクロールを管理するカスタムフック
 */
export function useToc({ activeContent, activePaneId }: UseTocOptions) {
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);

  // アクティブドキュメントから目次（H1〜H6）を抽出
  useEffect(() => {
    // レンダリング完了後にアクティブペインのDOMから見出しを抽出
    const timer = setTimeout(() => {
      if (!activeContent) {
        setTocItems([]);
        setActiveHeadingId(null);
        return;
      }

      const activePaneElement =
        document.querySelector(`[data-pane-id="${CSS.escape(activePaneId)}"] .markdown-body`) ||
        document.querySelector('.pane.active-pane .markdown-body');
      if (!activePaneElement) {
        setTocItems([]);
        return;
      }

      // レンダリングされた DOM 要素にアンカー用 ID を付与（スクロール連動・ジャンプ用）
      const headings = activePaneElement.querySelectorAll('h1, h2, h3, h4, h5, h6');
      headings.forEach((el, index) => {
        if (!el.id) {
          el.id = getHeadingId(index, el.textContent || '');
        }
      });

      // HTML文字列から目次項目を抽出
      const items = extractTocItems(activeContent);
      setTocItems(items);
    }, 60);

    return () => clearTimeout(timer);
  }, [activeContent, activePaneId]);

  // アクティブペインのスクロール位置を監視して現在地の見出しを特定
  useEffect(() => {
    if (tocItems.length === 0) return;

    const activeMarkdownBody =
      document.querySelector(`[data-pane-id="${CSS.escape(activePaneId)}"] .markdown-body`) ||
      document.querySelector('.pane.active-pane .markdown-body');
    if (!activeMarkdownBody) return;

    const handleScroll = () => {
      const headings = Array.from(activeMarkdownBody.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      if (headings.length === 0) return;

      const containerRect = activeMarkdownBody.getBoundingClientRect();
      let currentActive: string | null = headings[0].id || null;

      for (const heading of headings) {
        const rect = heading.getBoundingClientRect();
        if (rect.top - containerRect.top <= 120) {
          currentActive = heading.id;
        } else {
          break;
        }
      }
      setActiveHeadingId(currentActive);
    };

    activeMarkdownBody.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      activeMarkdownBody.removeEventListener('scroll', handleScroll);
    };
  }, [tocItems, activePaneId]);

  // 目次項目クリック時のスムーズスクロール
  const handleSelectHeading = useCallback((id: string) => {
    const activePaneElement =
      document.querySelector(`[data-pane-id="${CSS.escape(activePaneId)}"] .markdown-body`) ||
      document.querySelector('.pane.active-pane .markdown-body');
    if (!activePaneElement) return;
    const target = activePaneElement.querySelector(`[id="${CSS.escape(id)}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveHeadingId(id);
    }
  }, [activePaneId]);

  return {
    tocItems,
    activeHeadingId,
    handleSelectHeading,
  };
}
