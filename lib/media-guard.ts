/**
 * Users of this app may sit behind networks where YouTube/Google hosts are blocked.
 * Anything the browser is told to fetch (manifests, segments, images, captions) must
 * therefore point at our own origin or a proxying Invidious instance — never at Google.
 */
const BLOCKED_HOST =
  /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|ytimg\.com|googlevideo\.com|ggpht\.com|googleusercontent\.com)$/i;

export function isBlockedHost(hostname: string): boolean {
  return BLOCKED_HOST.test(hostname);
}

/** Removes links to blocked hosts from free text (e.g. video descriptions), keeping everything else. */
export function stripBlockedUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s"'<>]+/gi, (url) => {
    try {
      return isBlockedHost(new URL(url).hostname) ? "" : url;
    } catch {
      return url;
    }
  });
}

/** Returns every absolute URL inside `value` (deep) whose host is a blocked Google/YouTube host. */
export function findBlockedUrls(value: unknown): string[] {
  const found: string[] = [];
  const visit = (v: unknown) => {
    if (typeof v === "string") {
      for (const match of v.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
        try {
          if (isBlockedHost(new URL(match[0]).hostname)) found.push(match[0]);
        } catch {
          // not a URL
        }
      }
    } else if (Array.isArray(v)) {
      v.forEach(visit);
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(visit);
    }
  };
  visit(value);
  return found;
}

export function assertNoBlockedUrls<T>(payload: T): T {
  const blocked = findBlockedUrls(payload);
  if (blocked.length > 0) {
    throw new Error(`Response would expose blocked host(s): ${blocked.slice(0, 3).join(", ")}`);
  }
  return payload;
}
