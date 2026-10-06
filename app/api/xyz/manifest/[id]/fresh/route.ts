import { manifestResponse } from "@/lib/providers/manifest-response";

/** Uncached manifest for the player's retry (new signed segment URLs if the cached ones failed). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return manifestResponse(id, "none");
}
