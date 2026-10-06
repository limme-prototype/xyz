"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Search, Settings, X, ArrowLeft, ArrowUpLeft } from "lucide-react";

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
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [mobileSearch, setMobileSearch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focusSearch: () => {
      setMobileSearch(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    },
  }));

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || /^https?:\/\//i.test(trimmed)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/xyz?suggest=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (Array.isArray(data?.suggestions)) setSuggestions(data.suggestions.slice(0, 8));
        })
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setOpen(false);
    setHighlight(-1);
    inputRef.current?.blur();
    setMobileSearch(false);
    onSearch(trimmed);
  };

  const visibleSuggestions = query.trim().length >= 2 ? suggestions : [];

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
      setHighlight((h) => Math.min(h + 1, visibleSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === "ArrowRight" && highlight >= 0) {
      e.preventDefault();
      fillQuery(visibleSuggestions[highlight]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit(highlight >= 0 ? visibleSuggestions[highlight] : query);
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
              aria-expanded={open && visibleSuggestions.length > 0}
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
          </div>

          {open && visibleSuggestions.length > 0 && (
            <ul
              id="search-suggestions"
              role="listbox"
              onMouseLeave={() => setHighlight(-1)}
              className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-border bg-popover py-2 shadow-2xl"
            >
              {visibleSuggestions.map((s, i) => (
                <li
                  key={s}
                  id={`search-suggestion-${i}`}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseEnter={() => setHighlight(i)}
                  className={`relative flex items-center pr-1.5 ${i === highlight ? "bg-muted" : ""}`}
                >
                  {i === highlight && (
                    <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand" />
                  )}
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => submit(s)}
                    className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left text-base cursor-pointer"
                  >
                    <Search className={`size-4 shrink-0 ${i === highlight ? "text-brand" : "text-muted-foreground"}`} />
                    <span className="truncate">{s}</span>
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => fillQuery(s)}
                    title="Fill in search (→)"
                    aria-label={`Fill search with ${s}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-background/60 hover:text-brand cursor-pointer"
                  >
                    <ArrowUpLeft className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
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
