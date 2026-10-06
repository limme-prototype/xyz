import { fetchThumbnail } from "@/lib/providers/thumbnail";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Thumbnail by path (`/api/xyz/thumb/:id`), not query string: some CDNs (Netlify) ignore query
 * parameters in their cache key, which made every `?thumb=` URL return the first cached image.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!VIDEO_ID.test(id)) return new Response("Invalid video ID", { status: 400 });

  const thumb = await fetchThumbnail(id);
  return new Response(thumb.body, {
    headers: {
      "Content-Type": thumb.contentType,
      // Real images are immutable per video; the placeholder is retried soon.
      "Cache-Control": thumb.found
        ? "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400"
        : "public, max-age=300, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
