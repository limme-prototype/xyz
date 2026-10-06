import { NextResponse } from "next/server";
import { getHealthyInstances, mediaOrigin } from "@/lib/providers/instances";

/** Healthy instances plus the origins that serve their media, for client preconnect hints. */
export async function GET() {
  const instances = await getHealthyInstances();
  const mediaOrigins = [...new Set(instances.map(mediaOrigin).filter((o): o is string => o !== null))];
  return NextResponse.json(
    { instances, mediaOrigins },
    {
      headers: {
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
