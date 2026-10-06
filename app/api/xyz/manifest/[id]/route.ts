import { manifestResponse } from "@/lib/providers/manifest-response";

/** CDN-cached DASH manifest for a video (see manifestResponse). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return manifestResponse(id, "shared");
}
