import { NextResponse } from "next/server";
import { findBlockedUrls } from "@/lib/media-guard";
import { absolutizeManifest, fetchPlayableManifest, getHealthyInstances } from "@/lib/providers/instances";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Builds the DASH manifest response for a video. Shared by `/api/xyz/manifest/:id` (CDN-cached)
 * and `/api/xyz/manifest/:id/fresh` (never cached, used by the player's retry).
 *
 * The validated manifest is returned directly with absolute segment URLs, so the player needs a
 * single request. Segments still stream from the instance; only this small XML passes through us.
 * The id is in the path, not the query string: some CDNs (Netlify) ignore query parameters in
 * their cache key, which served one video's manifest for every id.
 */
export async function manifestResponse(id: string, cache: "shared" | "none"): Promise<Response> {
  if (!VIDEO_ID.test(id)) {
    return NextResponse.json({ error: "Invalid video ID" }, { status: 400 });
  }

  for (const instance of await getHealthyInstances()) {
    const manifest = await fetchPlayableManifest(instance, id);
    if (!manifest) continue;
    const xml = absolutizeManifest(manifest.xml, manifest.url);
    if (findBlockedUrls(xml).length > 0) continue;
    return new Response(xml, {
      headers: {
        "Content-Type": "application/dash+xml; charset=utf-8",
        // Signed segment URLs stay valid ~6h. Browser may reuse it briefly (next-video prefetch).
        "Cache-Control":
          cache === "shared" ? "public, max-age=300, s-maxage=1800, stale-while-revalidate=600" : "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return NextResponse.json(
    { error: "This video can't be played right now" },
    { status: 404, headers: { "Cache-Control": cache === "shared" ? "public, s-maxage=60" : "no-store" } }
  );
}
