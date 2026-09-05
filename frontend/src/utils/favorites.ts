import { BookmarkItem } from '../types';

const STORAGE_KEY_BOOKMARKS = 'bus_1650_bookmarks';
const STORAGE_KEY_DEFAULT = 'bus_1650_default_bookmark_id';

export function getBookmarks(): BookmarkItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BOOKMARKS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveBookmarks(bookmarks: BookmarkItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_BOOKMARKS, JSON.stringify(bookmarks));
  } catch (e) {
    console.error('Failed to save bookmarks:', e);
  }
}

export function getDefaultBookmarkId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_DEFAULT);
  } catch {
    return null;
  }
}

export function setDefaultBookmarkId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEY_DEFAULT, id);
    } else {
      localStorage.removeItem(STORAGE_KEY_DEFAULT);
    }
  } catch (e) {
    console.error('Failed to set default bookmark:', e);
  }
}

export function getDefaultBookmark(): BookmarkItem | null {
  const bookmarks = getBookmarks();
  const defaultId = getDefaultBookmarkId();
  if (defaultId) {
    const found = bookmarks.find((b) => b.id === defaultId);
    if (found) return found;
  }
  const marked = bookmarks.find((b) => b.isDefault);
  if (marked) return marked;
  return bookmarks[0] || null;
}

export function isStationBookmarked(stationSeq: number): boolean {
  const bookmarks = getBookmarks();
  return bookmarks.some((b) => b.type === 'STATION' && b.stationSeq === stationSeq);
}

export function isPairBookmarked(fromSeq: number, toSeq: number): boolean {
  const bookmarks = getBookmarks();
  return bookmarks.some(
    (b) => b.type === 'PAIR' && b.fromSeq === fromSeq && b.toSeq === toSeq
  );
}

export function toggleStationBookmark(
  stationSeq: number,
  stationName: string,
  direction?: 'UP' | 'DOWN'
): boolean {
  const bookmarks = getBookmarks();
  const existingIndex = bookmarks.findIndex(
    (b) => b.type === 'STATION' && b.stationSeq === stationSeq
  );

  if (existingIndex >= 0) {
    const removedId = bookmarks[existingIndex].id;
    bookmarks.splice(existingIndex, 1);
    saveBookmarks(bookmarks);
    if (getDefaultBookmarkId() === removedId) {
      setDefaultBookmarkId(bookmarks[0]?.id || null);
    }
    return false; // Removed
  } else {
    const isFirst = bookmarks.length === 0;
    const newItem: BookmarkItem = {
      id: `station_${stationSeq}_${Date.now()}`,
      type: 'STATION',
      title: stationName,
      stationSeq,
      stationName,
      direction,
      isDefault: isFirst,
    };
    bookmarks.push(newItem);
    saveBookmarks(bookmarks);
    if (isFirst) {
      setDefaultBookmarkId(newItem.id);
    }
    return true; // Added
  }
}

export function togglePairBookmark(
  fromSeq: number,
  fromName: string,
  toSeq: number,
  toName: string
): boolean {
  const bookmarks = getBookmarks();
  const existingIndex = bookmarks.findIndex(
    (b) => b.type === 'PAIR' && b.fromSeq === fromSeq && b.toSeq === toSeq
  );

  if (existingIndex >= 0) {
    const removedId = bookmarks[existingIndex].id;
    bookmarks.splice(existingIndex, 1);
    saveBookmarks(bookmarks);
    if (getDefaultBookmarkId() === removedId) {
      setDefaultBookmarkId(bookmarks[0]?.id || null);
    }
    return false;
  } else {
    const isFirst = bookmarks.length === 0;
    const newItem: BookmarkItem = {
      id: `pair_${fromSeq}_${toSeq}_${Date.now()}`,
      type: 'PAIR',
      title: `${fromName} → ${toName}`,
      fromSeq,
      fromName,
      toSeq,
      toName,
      isDefault: isFirst,
    };
    bookmarks.push(newItem);
    saveBookmarks(bookmarks);
    if (isFirst) {
      setDefaultBookmarkId(newItem.id);
    }
    return true;
  }
}

export function removeBookmark(id: string): void {
  const bookmarks = getBookmarks().filter((b) => b.id !== id);
  saveBookmarks(bookmarks);
  if (getDefaultBookmarkId() === id) {
    setDefaultBookmarkId(bookmarks[0]?.id || null);
  }
}

export function setAsDefault(id: string): void {
  const bookmarks = getBookmarks().map((b) => ({
    ...b,
    isDefault: b.id === id,
  }));
  saveBookmarks(bookmarks);
  setDefaultBookmarkId(id);
}
