import { describe, expect, it } from "vitest";
import {
  addSearchHistory,
  readSearchHistory,
  removeSearchHistoryItem,
  SEARCH_HISTORY_KEY,
  SEARCH_HISTORY_LIMIT,
  writeSearchHistory,
  type SearchHistoryItem,
} from "../lib/search-history";

const NOW = Date.parse("2026-10-23T00:00:00Z");

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    get: (key: string) => values.get(key),
  };
}

describe("search history", () => {
  it("adds recent queries first, keeps original capitalization, and de-duplicates case-insensitively", () => {
    const first = addSearchHistory([], "  Suly Pheng  ", NOW);
    const next = addSearchHistory(first, "Tena", NOW + 3_000);
    const repeated = addSearchHistory(next, "sULY pHENG", NOW + 6_000);

    expect(repeated).toEqual([
      { query: "Suly Pheng", searchedAt: NOW + 6_000 },
      { query: "Tena", searchedAt: NOW + 3_000 },
    ]);
  });

  it("ignores empty and accidental duplicate submissions", () => {
    const history = addSearchHistory([], "  query ", NOW);

    expect(addSearchHistory(history, "  ", NOW + 3_000)).toBe(history);
    expect(addSearchHistory(history, "QUERY", NOW + 1_000)).toBe(history);
  });

  it("keeps only the configured maximum number of searches", () => {
    const history = Array.from({ length: SEARCH_HISTORY_LIMIT + 2 }, (_, i) => ({
      query: `query-${i}`,
      searchedAt: NOW + i,
    })).reduce<SearchHistoryItem[]>((items, item) => addSearchHistory(items, item.query, item.searchedAt), []);

    expect(history).toHaveLength(SEARCH_HISTORY_LIMIT);
    expect(history[0].query).toBe(`query-${SEARCH_HISTORY_LIMIT + 1}`);
  });

  it("persists history and removes individual entries", () => {
    const storage = createStorage();
    const history = addSearchHistory([], "Suly Pheng", NOW);

    expect(writeSearchHistory(storage, history)).toBe(true);
    expect(readSearchHistory(storage, NOW)).toEqual({ history, available: true });
    expect(removeSearchHistoryItem(history, "suly pheng")).toEqual([]);
  });

  it("drops malformed, expired, future-dated, and duplicate entries while reading", () => {
    const storage = createStorage({
      [SEARCH_HISTORY_KEY]: JSON.stringify([
        { query: "Current", searchedAt: NOW - 1_000 },
        { query: "current", searchedAt: NOW - 2_000 },
        { query: "Expired", searchedAt: NOW - 91 * 24 * 60 * 60 * 1000 },
        { query: "Future", searchedAt: NOW + 1 },
        null,
      ]),
    });

    expect(readSearchHistory(storage, NOW)).toEqual({
      history: [{ query: "Current", searchedAt: NOW - 1_000 }],
      available: true,
    });
  });

  it("handles malformed persisted JSON and unavailable storage", () => {
    const malformed = createStorage({ [SEARCH_HISTORY_KEY]: "not-json" });
    const unavailable = {
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("storage disabled");
      },
      removeItem: () => {
        throw new Error("storage disabled");
      },
    };

    expect(readSearchHistory(malformed, NOW)).toEqual({ history: [], available: true });
    expect(readSearchHistory(unavailable, NOW)).toEqual({ history: [], available: false });
    expect(writeSearchHistory(unavailable, [])).toBe(false);
  });
});
