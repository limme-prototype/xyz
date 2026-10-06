/**
 * Video thumbnails, fetched server-side: the browser may be on a network where Google image hosts
 * are blocked, so it only ever loads them from our origin.
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const FALLBACK_THUMBNAIL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180" fill="none"><rect width="320" height="180" fill="#221e27"/><path d="M146 72l28 18-28 18V72z" fill="#a59cad"/></svg>`;

export async function fetchThumbnail(
  videoId: string
): Promise<{ body: ArrayBuffer | string; contentType: string; found: boolean }> {
  const candidates = [
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
        signal: AbortSignal.timeout(2500),
      });
      const contentType = res.headers.get("content-type") || "";
      if (res.ok && contentType.startsWith("image/")) {
        return { body: await res.arrayBuffer(), contentType, found: true };
      }
    } catch {
      // try next candidate
    }
  }
  return { body: FALLBACK_THUMBNAIL_SVG, contentType: "image/svg+xml", found: false };
}
