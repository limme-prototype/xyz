import { NextResponse } from "next/server";
import { assertNoBlockedUrls } from "@/lib/media-guard";
import { fetchInvidiousJson, normalizeComment, type InvidiousComment } from "@/lib/providers/invidious";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CONTINUATION = /^[A-Za-z0-9_\-%=]{1,2048}$/;

interface InvidiousCommentsResponse {
  commentCount?: number;
  comments?: InvidiousComment[];
  continuation?: string;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id")?.trim() ?? "";
  const sort = params.get("sort") === "new" ? "new" : "top";
  const continuation = params.get("continuation")?.trim() || null;

  if (!VIDEO_ID.test(id)) {
    return NextResponse.json({ error: "Invalid video ID" }, { status: 400 });
  }
  if (continuation && !CONTINUATION.test(continuation)) {
    return NextResponse.json({ error: "Invalid continuation" }, { status: 400 });
  }

  const query = new URLSearchParams({ sort_by: sort, source: "youtube" });
  if (continuation) query.set("continuation", continuation);

  const result = await fetchInvidiousJson<InvidiousCommentsResponse>(
    `/api/v1/comments/${id}?${query.toString()}`,
    { accept: (d) => Array.isArray((d as InvidiousCommentsResponse)?.comments) }
  );

  if (!result) {
    return NextResponse.json(
      { id, items: [], continuation: null, available: false },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  }

  const payload = assertNoBlockedUrls({
    id,
    commentCount: result.data.commentCount ?? null,
    items: (result.data.comments ?? []).map(normalizeComment),
    continuation: result.data.continuation ?? null,
    available: true,
  });

  return NextResponse.json(payload, {
    headers: {
      // Varies by query parameters; not every CDN keys on them, so browser cache only.
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
