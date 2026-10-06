import { NextResponse } from "next/server";
import { assertNoBlockedUrls } from "@/lib/media-guard";
import { findSection } from "@/lib/content/sections";
import { resolveSection } from "@/lib/content/resolve";

const PAGE_TOKEN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * One list for the "Up next" tabs. Lists are identical for every visitor, so the CDN serves a
 * cached copy and refreshes it in the background (RSS and Data API are hit at most ~hourly).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const section = findSection(id);
  if (!section) {
    return NextResponse.json({ error: "Unknown section" }, { status: 404 });
  }

  const pageToken = new URL(request.url).searchParams.get("pageToken")?.trim() || undefined;
  if (pageToken && !PAGE_TOKEN.test(pageToken)) {
    return NextResponse.json({ error: "Invalid page token" }, { status: 400 });
  }

  const result = await resolveSection(section, { apiKey: process.env.XYZ_API_KEY || undefined, pageToken });
  const payload = assertNoBlockedUrls(result);

  return NextResponse.json(payload, {
    headers: {
      // A seed fallback means the live sources failed: retry sooner.
      // Later pages vary by `pageToken` (a query parameter), which not every CDN keys on: browser only.
      "Cache-Control": pageToken
        ? "private, max-age=300"
        : result.origin === "seed" && section.source.kind !== "seed"
          ? "public, s-maxage=300, stale-while-revalidate=3600"
          : "public, s-maxage=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
