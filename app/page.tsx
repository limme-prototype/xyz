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

      <XyzPlayer />

      <footer className="border-t border-border/40 py-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 text-xs text-muted-foreground sm:px-6">
          <p>xyz &bull; Distraction-free video player</p>
          <p className="hidden sm:block">Clean &bull; Minimalist</p>
        </div>
      </footer>
    </div>
  );
}
