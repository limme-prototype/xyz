import { XyzPlayer } from "./_components/xyz-player";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const resolvedParams = await searchParams;
  const initialVideoId =
    resolvedParams?.v && /^[A-Za-z0-9_-]{11}$/.test(resolvedParams.v)
      ? resolvedParams.v
      : undefined;

  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow"
        href="#main"
      >
        Skip to player
      </a>

      <XyzPlayer initialVideoId={initialVideoId} />

    </div>
  );
}
