import { NextResponse } from "next/server";
import { assertNoBlockedUrls } from "@/lib/media-guard";
import { getHealthyInstances, resolvePlayableManifest } from "@/lib/providers/instances";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Playback sources for a video. Each instance's manifest is resolved (past its CORS-less redirect)
 * and validated server-side, so the browser only receives sources that can actually play.
 * The browser then loads the manifest and segments straight from the instance's companion host;
 * Vercel never carries media bytes.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!VIDEO_ID.test(id)) {
    return NextResponse.json({ error: "Invalid video ID" }, { status: 400 });
  }

  const instances = await getHealthyInstances();
  const resolved = await Promise.all(
    instances.map(async (instance) => ({ instance, manifestUrl: await resolvePlayableManifest(instance, id) }))
  );
  const sources = resolved.filter((s): s is { instance: string; manifestUrl: string } => s.manifestUrl !== null);
  const payload = assertNoBlockedUrls({ id, playable: sources.length > 0, sources });

  return NextResponse.json(payload, {
    headers: {
      // Failures are often transient on public instances, so cache them only briefly.
      // Varies by `?id=`; not every CDN keys on query parameters, so browser cache only.
      "Cache-Control": payload.playable ? "private, max-age=300" : "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
