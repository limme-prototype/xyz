import { XyzPlayer } from "./_components/xyz-player";

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow"
        href="#main"
      >
        Skip to player
      </a>

      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-foreground" />
            <span className="font-semibold text-sm tracking-tight text-foreground">
              xyz
            </span>
          </div>

          <div className="flex items-center gap-2">
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">/</span> to search
            </kbd>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1 py-6 sm:py-8">
        <XyzPlayer />
      </main>

      <footer className="border-t border-border/40 py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 text-xs text-muted-foreground sm:px-6">
          <p>xyz &bull; Distraction-free video player</p>
          <p className="hidden sm:block">Clean &bull; Minimalist</p>
        </div>
      </footer>
    </div>
  );
}
