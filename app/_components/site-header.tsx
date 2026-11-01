"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Clock3, Search, Settings, X, ArrowLeft, ArrowUpLeft } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING } from "@/lib/motion";
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
  const formRef = useRef<HTMLFormElement>(null);

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
    /* iOS navigation bar: glass-chrome material, sticky */
    <header className="glass-chrome sticky top-0 z-40">
      {/* 44pt controls centred in --nav-height, 16pt horizontal margins.
          Equal 1fr side tracks make the middle track exactly viewport-centred,
          regardless of how wide the logo and trailing controls are. */}
      <div className="flex h-[var(--nav-height)] items-center gap-[var(--space-3)] px-[var(--space-4)] sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,640px)_minmax(0,1fr)]">
        <div
          className={`flex min-w-0 items-center gap-[var(--space-2)] justify-self-start ${
            mobileSearch ? "hidden sm:flex" : "flex"
          }`}
        >
          <button
            type="button"
            onClick={onHome}
            className="interactive flex shrink-0 cursor-pointer items-center gap-[var(--space-2)] rounded-[var(--radius-sm)]"
            aria-label="xyz home"
          >
            {/* Axis mark: x, y and z meeting at an origin */}
            <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true">
              <path d="M9 15V3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M9 15h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M9 15l-6 6" className="stroke-brand" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="9" cy="15" r="2.2" className="fill-brand" />
            </svg>
            <span className="font-display text-title-3 font-bold tracking-[var(--tracking-title-3)]">xyz</span>
          </button>

          {mobileSearch && (
            <button
              type="button"
              onClick={() => setMobileSearch(false)}
              className="interactive flex size-[var(--space-tap)] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--ios-fill-3)] sm:hidden"
              aria-label="Close search"
            >
              <ArrowLeft className="size-5" />
            </button>
          )}
        </div>

        <form
          ref={formRef}
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            submit(query);
          }}
          className={`relative w-full min-w-0 flex-1 sm:flex-none sm:justify-self-center ${
            mobileSearch ? "flex" : "hidden sm:flex"
          }`}
        >
          <div className="flex h-[var(--space-tap)] flex-1 items-center gap-[var(--space-2)] overflow-hidden rounded-full border border-[var(--ios-separator)] bg-[var(--ios-fill-3)] pl-[var(--space-4)] pr-1.5 backdrop-blur-sm transition-colors focus-within:border-[var(--ios-blue)]">
            <Search className="size-4 shrink-0 text-[var(--ios-label-3)]" aria-hidden="true" />
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
              onBlur={(e) => {
                setTimeout(() => setOpen(false), 120);
                // Tapping away from the expanded mobile field should put the
                // nav bar back; the in-field buttons are inside the form, so
                // they must not trigger this.
                if (mobileSearch && !formRef.current?.contains(e.relatedTarget as Node | null)) {
                  setMobileSearch(false);
                }
              }}
              onKeyDown={onKeyDown}
              placeholder="Search videos or paste a link"
              aria-label="Search"
              role="combobox"
              aria-controls="search-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={highlight >= 0 ? `search-suggestion-${highlight}` : undefined}
              aria-expanded={open}
              className="w-full min-w-0 bg-transparent text-body leading-none tracking-[var(--tracking-body)] outline-none placeholder:text-[var(--ios-placeholder)] [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSuggestions([]);
                  inputRef.current?.focus();
                }}
                className="interactive tap-compact flex size-7 !h-7 !w-7 !min-h-0 !min-w-0 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--ios-label-2)] hover:bg-[var(--ios-fill-4)]"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
            <button
              type="submit"
              disabled={!query.trim()}
              aria-label="Submit search"
              className="interactive tap-compact flex size-8 !h-8 !w-8 !min-h-0 !min-w-0 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--ios-blue)] text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Search className="size-4" aria-hidden="true" />
            </button>
          </div>

          <AnimatePresence>
            {open && (
              <motion.div
                id="search-suggestions"
                role="listbox"
                aria-label="Search suggestions and recent searches"
                onMouseLeave={() => setHighlight(-1)}
                className="glass-regular absolute left-0 right-0 top-[calc(var(--space-tap)+var(--space-2))] z-50 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--ios-separator)] py-[var(--space-2)] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.7)]"
                style={{ transformOrigin: "top center" }}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={SPRING.ui}
                >
                {history.length > 0 && (
                  <div role="presentation" className="flex items-center justify-between px-[var(--space-4)] pb-1 pt-1">
                      <p className="text-caption-1 font-semibold uppercase tracking-[var(--tracking-caption)] text-[var(--ios-label-2)]">Recent searches</p>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={clearHistory}
                        className="interactive tap-compact cursor-pointer rounded-[var(--radius-xs)] px-1 py-0.5 text-footnote text-[var(--ios-label-2)] hover:text-[var(--ios-label)] focus-visible:text-[var(--ios-label)]"
                      >
                        Clear search history
                      </button>
                  </div>
                )}
                {remoteSuggestions.length > 0 && (
                  <div role="presentation" className="px-[var(--space-4)] pb-1 pt-1 text-caption-1 font-semibold uppercase tracking-[var(--tracking-caption)] text-[var(--ios-label-2)]">
                    {history.length > 0 && <div className="mb-2 border-t border-[var(--ios-separator)]" />}
                    Suggestions
                  </div>
                )}
                {visibleSuggestions.map((item, i) => (
                  <div
                    key={`${item.source}-${item.query}`}
                    role="presentation"
                    className={`relative flex items-center pr-[var(--space-1)] ${i === highlight ? "bg-[var(--ios-fill-4)]" : ""}`}
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
                      className="interactive tap-compact flex min-w-0 flex-1 cursor-pointer items-center gap-[var(--space-3)] py-[var(--space-2)] pl-[var(--space-4)] text-left text-body tracking-[var(--tracking-body)]"
                    >
                      {item.source === "history" ? (
                        <Clock3 className={`size-4 shrink-0 ${i === highlight ? "text-[var(--ios-blue)]" : "text-[var(--ios-label-3)]"}`} />
                      ) : (
                        <Search className={`size-4 shrink-0 ${i === highlight ? "text-[var(--ios-blue)]" : "text-[var(--ios-label-3)]"}`} />
                      )}
                      <span className="truncate">{item.query}</span>
                    </button>
                    {item.source === "history" ? (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => removeHistoryItem(item.query)}
                        aria-label={`Remove ${item.query} from search history`}
                        className="interactive tap-compact flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--ios-label-3)] hover:bg-[var(--ios-fill-4)] hover:text-[var(--ios-label)]"
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
                        className="interactive tap-compact flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--ios-label-3)] hover:bg-[var(--ios-fill-4)] hover:text-[var(--ios-blue)]"
                      >
                        <ArrowUpLeft className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
                {matchingHistory.length === 0 && remoteSuggestions.length === 0 && (
                  <p className="px-[var(--space-4)] py-[var(--space-3)] text-body text-[var(--ios-label-2)]" role="status">
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
                  <p className="px-[var(--space-4)] py-[var(--space-2)] text-footnote text-[var(--ios-label-2)]" role="status">Loading suggestions...</p>
                )}
                {suggestionsFailed && trimmedQuery.length >= 2 && (
                  <p className="px-[var(--space-4)] py-[var(--space-2)] text-footnote text-[var(--ios-label-2)]" role="status">Suggestions are temporarily unavailable.</p>
                )}
                {!historyAvailable && (
                  <p className="px-[var(--space-4)] py-[var(--space-2)] text-footnote text-[var(--ios-label-2)]" role="status">
                    Search history changes are not being saved in this browser.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        <div className={`ml-auto items-center gap-1 justify-self-end sm:ml-0 ${mobileSearch ? "hidden sm:flex" : "flex"}`}>
          <button
            type="button"
            onClick={() => {
              setMobileSearch(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="interactive flex size-[var(--space-tap)] cursor-pointer items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--ios-fill-3)] sm:hidden"
            aria-label="Search"
          >
            <Search className="size-5" />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="interactive flex size-[var(--space-tap)] cursor-pointer items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--ios-fill-3)]"
            aria-label="Settings"
          >
            <Settings className="size-5" />
          </button>
        </div>
      </div>
    </header>
  );
});
