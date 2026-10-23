"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Clock3, Search, Settings, X, ArrowLeft, ArrowUpLeft } from "lucide-react";
import { parseXyzUrl } from "@/lib/xyz";
import {
  addSearchHistory,
  readSearchHistory,
  removeSearchHistoryItem,
  SEARCH_HISTORY_KEY,
  writeSearchHistory,
  type SearchHistoryItem,
} from "@/lib/search-history";

export interface SiteHeaderHandle {
  focusSearch: () => void;
}

interface SiteHeaderProps {
  onSearch: (query: string) => void;
  onOpenSettings: () => void;
  onHome: () => void;
}

/** Top bar: logo, search with suggestions, settings. */
export const SiteHeader = forwardRef<SiteHeaderHandle, SiteHeaderProps>(function SiteHeader(
  { onSearch, onOpenSettings, onHome },
  ref
) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [historyAvailable, setHistoryAvailable] = useState(true);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsFailed, setSuggestionsFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [mobileSearch, setMobileSearch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const syncHistory = () => {
      try {
        const result = readSearchHistory(window.localStorage);
        setHistory(result.history);
        setHistoryAvailable(result.available);
      } catch {
        setHistory([]);
        setHistoryAvailable(false);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === SEARCH_HISTORY_KEY) syncHistory();
    };

    syncHistory();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useImperativeHandle(ref, () => ({
    focusSearch: () => {
      setMobileSearch(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    },
  }));

  useEffect(() => {
    const trimmed = query.trim();
    setSuggestions([]);
    if (trimmed.length < 2 || /^https?:\/\//i.test(trimmed)) {
      setSuggestionsLoading(false);
      setSuggestionsFailed(false);
      return;
    }
    const controller = new AbortController();
    setSuggestionsLoading(true);
    setSuggestionsFailed(false);
    const timer = setTimeout(() => {
      fetch(`/api/xyz?suggest=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error("Suggestion request failed");
          return res.json();
        })
        .then((data) => {
          if (controller.signal.aborted) return;
          setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions.slice(0, 8) : []);
          setSuggestionsFailed(!Array.isArray(data?.suggestions));
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSuggestions([]);
            setSuggestionsFailed(true);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSuggestionsLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const isVideoLinkOrId = /^https?:\/\//i.test(trimmed) || parseXyzUrl(trimmed).ok;
    if (!isVideoLinkOrId) {
      const nextHistory = addSearchHistory(history, trimmed);
      setHistory(nextHistory);
      try {
        setHistoryAvailable(writeSearchHistory(window.localStorage, nextHistory));
      } catch {
        setHistoryAvailable(false);
      }
    }
    setQuery(trimmed);
    setOpen(false);
    setHighlight(-1);
    inputRef.current?.blur();
    setMobileSearch(false);
    onSearch(trimmed);
  };

  const trimmedQuery = query.trim();
  const matchingHistory = history.filter((item) => item.query.toLowerCase().includes(trimmedQuery.toLowerCase()));
  const remoteSuggestions = trimmedQuery.length >= 2 ? suggestions : [];
  const visibleSuggestions = [
    ...matchingHistory.map((item) => ({ query: item.query, source: "history" as const })),
    ...remoteSuggestions
      .filter((suggestion) => !matchingHistory.some((item) => item.query.toLowerCase() === suggestion.toLowerCase()))
      .map((suggestion) => ({ query: suggestion, source: "remote" as const })),
  ];

  const removeHistoryItem = (search: string) => {
    const nextHistory = removeSearchHistoryItem(history, search);
    setHistory(nextHistory);
    try {
      setHistoryAvailable(writeSearchHistory(window.localStorage, nextHistory));
    } catch {
      setHistoryAvailable(false);
    }
    setHighlight(-1);
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      setHistoryAvailable(writeSearchHistory(window.localStorage, []));
    } catch {
      setHistoryAvailable(false);
    }
    setHighlight(-1);
  };

  /** Puts a suggestion into the box (without searching) so it can be refined. */
  const fillQuery = (value: string) => {
    setQuery(`${value} `);
    setHighlight(-1);
    setOpen(true);
    const input = inputRef.current;
    if (input) {
      input.focus();
      setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (visibleSuggestions.length > 0) {
        setHighlight((h) => (h + 1) % visibleSuggestions.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (visibleSuggestions.length > 0) {
        setHighlight((h) => (h <= 0 ? visibleSuggestions.length - 1 : h - 1));
      }
    } else if (e.key === "ArrowRight" && highlight >= 0) {
      e.preventDefault();
      fillQuery(visibleSuggestions[highlight].query);
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit(highlight >= 0 ? visibleSuggestions[highlight].query : query);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="flex h-14 items-center gap-4 px-4">
        <button
          type="button"
          onClick={onHome}
          className={`shrink-0 items-center gap-2 rounded-md cursor-pointer ${mobileSearch ? "hidden sm:flex" : "flex"}`}
          aria-label="xyz home"
        >
          {/* Axis mark: x, y and z meeting at an origin */}
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
            <path d="M9 15V3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M9 15h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M9 15l-6 6" className="stroke-brand" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="9" cy="15" r="2.2" className="fill-brand" />
          </svg>
          <span className="font-display text-xl font-bold tracking-tight">xyz</span>
        </button>

        {mobileSearch && (
          <button
            type="button"
            onClick={() => setMobileSearch(false)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] hover:bg-secondary sm:hidden cursor-pointer"
            aria-label="Close search"
          >
            <ArrowLeft className="size-5" />
          </button>
        )}

        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            submit(query);
          }}
          className={`relative mx-auto w-full max-w-[640px] ${mobileSearch ? "flex" : "hidden sm:flex"}`}
        >
          <div className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-border bg-input-bg pl-3 pr-1 transition-colors focus-within:border-brand/60">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
                setHighlight(-1);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onKeyDown={onKeyDown}
              placeholder="Search videos or paste a link"
              aria-label="Search"
              role="combobox"
              aria-controls="search-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={highlight >= 0 ? `search-suggestion-${highlight}` : undefined}
              aria-expanded={open}
              className="h-full w-full bg-transparent text-base outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSuggestions([]);
                  inputRef.current?.focus();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-[10px] hover:bg-secondary cursor-pointer"
                aria-label="Clear search"
              >
                <X className="size-5" />
              </button>
            )}
            <button
              type="submit"
              disabled={!query.trim()}
              aria-label="Submit search"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-brand text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Search className="size-4" aria-hidden="true" />
            </button>
          </div>

          {open && (
            <div
              id="search-suggestions"
              role="listbox"
              aria-label="Search suggestions and recent searches"
              onMouseLeave={() => setHighlight(-1)}
              className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-border bg-popover py-2 shadow-2xl"
            >
              {history.length > 0 && (
                <div role="presentation" className="flex items-center justify-between px-4 pb-1 pt-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent searches</p>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={clearHistory}
                      className="rounded px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground focus-visible:text-foreground"
                    >
                      Clear search history
                    </button>
                </div>
              )}
              {remoteSuggestions.length > 0 && (
                <div role="presentation" className="px-4 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {history.length > 0 && <div className="mb-2 border-t border-border" />}
                  Suggestions
                </div>
              )}
              {visibleSuggestions.map((item, i) => (
                <div
                  key={`${item.source}-${item.query}`}
                  role="presentation"
                  className={`relative flex items-center pr-1.5 ${i === highlight ? "bg-muted" : ""}`}
                >
                  {i === highlight && <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand" />}
                  <button
                    type="button"
                    id={`search-suggestion-${i}`}
                    role="option"
                    aria-selected={i === highlight}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => submit(item.query)}
                    className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left text-sm cursor-pointer"
                  >
                    {item.source === "history" ? (
                      <Clock3 className={`size-4 shrink-0 ${i === highlight ? "text-brand" : "text-muted-foreground"}`} />
                    ) : (
                      <Search className={`size-4 shrink-0 ${i === highlight ? "text-brand" : "text-muted-foreground"}`} />
                    )}
                    <span className="truncate">{item.query}</span>
                  </button>
                  {item.source === "history" ? (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => removeHistoryItem(item.query)}
                      aria-label={`Remove ${item.query} from search history`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-background/60 hover:text-foreground cursor-pointer"
                    >
                      <X className="size-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => fillQuery(item.query)}
                      title="Fill in search"
                      aria-label={`Fill search with ${item.query}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-background/60 hover:text-brand cursor-pointer"
                    >
                      <ArrowUpLeft className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              {matchingHistory.length === 0 && remoteSuggestions.length === 0 && (
                <p className="px-4 py-3 text-sm text-muted-foreground" role="status">
                  {trimmedQuery.length === 0
                    ? historyAvailable
                      ? "Your recent searches will appear here."
                      : "Search history is unavailable in this browser."
                    : suggestionsLoading
                    ? "Loading suggestions..."
                    : suggestionsFailed
                    ? "Suggestions are temporarily unavailable. You can still search."
                    : history.length > 0
                    ? "No matching recent searches."
                    : "No recent searches yet."}
                </p>
              )}
              {matchingHistory.length > 0 && suggestionsLoading && (
                <p className="px-4 py-2 text-xs text-muted-foreground" role="status">Loading suggestions...</p>
              )}
              {suggestionsFailed && trimmedQuery.length >= 2 && (
                <p className="px-4 py-2 text-xs text-muted-foreground" role="status">Suggestions are temporarily unavailable.</p>
              )}
              {!historyAvailable && (
                <p className="px-4 py-2 text-xs text-muted-foreground" role="status">
                  Search history changes are not being saved in this browser.
                </p>
              )}
            </div>
          )}
        </form>

        <div className={`ml-auto items-center gap-1 ${mobileSearch ? "hidden sm:flex" : "flex"}`}>
          <button
            type="button"
            onClick={() => {
              setMobileSearch(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-[10px] hover:bg-secondary sm:hidden cursor-pointer"
            aria-label="Search"
          >
            <Search className="size-5" />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-10 w-10 items-center justify-center rounded-[10px] hover:bg-secondary cursor-pointer"
            aria-label="Settings"
          >
            <Settings className="size-5" />
          </button>
        </div>
      </div>
    </header>
  );
});
