/**
 * アプリ内でのタブドラッグ＆ドロップ状態を一元管理するモジュール
 * HTML5 Drag & Drop APIのブラウザ/WebView2間におけるMIMEタイプ制限や
 * dragover中のgetDataアクセス制限を回避し、確実・高速なDnDを実現する
 */

export interface DraggingTabData {
  paneId: string;
  tabId: string;
}

let currentDraggingTab: DraggingTabData | null = null;

/** ドラッグ中のタブ情報をセット */
export function setDraggingTab(data: DraggingTabData | null): void {
  currentDraggingTab = data;
}

/** 現在ドラッグ中のタブ情報を取得 */
export function getDraggingTab(): DraggingTabData | null {
  return currentDraggingTab;
}

/** 現在タブをドラッグ中かどうか */
export function isDraggingTab(): boolean {
  return currentDraggingTab !== null;
}
