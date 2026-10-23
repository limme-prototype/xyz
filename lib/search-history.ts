export const SEARCH_HISTORY_KEY = "xyz_search_history";
export const SEARCH_HISTORY_LIMIT = 10;
export const SEARCH_HISTORY_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export interface SearchHistoryItem {
  query: string;
  searchedAt: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function sanitizeHistory(value: unknown, now: number): SearchHistoryItem[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const history: SearchHistoryItem[] = [];
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      !("query" in item) ||
      typeof item.query !== "string" ||
      !("searchedAt" in item) ||
      typeof item.searchedAt !== "number" ||
      !Number.isFinite(item.searchedAt) ||
      item.searchedAt > now ||
      now - item.searchedAt > SEARCH_HISTORY_MAX_AGE_MS
    ) {
      continue;
    }

    const query = item.query.trim();
    const normalized = normalizeQuery(query);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    history.push({ query, searchedAt: item.searchedAt });
    if (history.length === SEARCH_HISTORY_LIMIT) break;
  }
  return history;
}

export function readSearchHistory(
  storage: StorageLike,
  now = Date.now()
): { history: SearchHistoryItem[]; available: boolean } {
  let saved: string | null;
  try {
    saved = storage.getItem(SEARCH_HISTORY_KEY);
  } catch {
    return { history: [], available: false };
  }

  if (!saved) return { history: [], available: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(saved);
  } catch {
    parsed = [];
  }

  const history = sanitizeHistory(parsed, now);
  try {
    if (history.length === 0) storage.removeItem(SEARCH_HISTORY_KEY);
    else {
      const normalized = JSON.stringify(history);
      if (normalized !== saved) storage.setItem(SEARCH_HISTORY_KEY, normalized);
    }
    return { history, available: true };
  } catch {
    return { history, available: false };
  }
}

export function addSearchHistory(
  history: SearchHistoryItem[],
  query: string,
  now = Date.now()
): SearchHistoryItem[] {
  const trimmed = query.trim();
  const normalized = normalizeQuery(trimmed);
  if (!normalized) return history;

  const existing = history.find((item) => normalizeQuery(item.query) === normalized);
  if (existing && now - existing.searchedAt < 2_000) return history;

  return [
    { query: existing?.query ?? trimmed, searchedAt: now },
    ...history.filter((item) => normalizeQuery(item.query) !== normalized),
  ].slice(0, SEARCH_HISTORY_LIMIT);
}

export function removeSearchHistoryItem(history: SearchHistoryItem[], query: string): SearchHistoryItem[] {
  const normalized = normalizeQuery(query);
  return history.filter((item) => normalizeQuery(item.query) !== normalized);
}

export function writeSearchHistory(storage: StorageLike, history: SearchHistoryItem[]): boolean {
  try {
    if (history.length === 0) storage.removeItem(SEARCH_HISTORY_KEY);
    else storage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, SEARCH_HISTORY_LIMIT)));
    return true;
  } catch {
    return false;
  }
}
