# Playback plan: Vercel only, YouTube blocked for users

Research date: 2026-10-06.
Constraints:
- Deploy **only** on Vercel (Hobby, $0) and run **no VM or server of your own**.
- The user's browser must **never connect to YouTube or Google domains**.

## 1. The only design that meets all three constraints

Vercel **can't carry the video bytes itself**:
- Fair use lists "Proxies and VPNs" as *never fair use* (on Pro as well).
- Hobby includes only 10 GB/month of Fast Origin Transfer.
- Function responses are capped at 4.5 MB.
- Egress IPs rotate, but googlevideo URLs are IP-bound.
- AWS IPs get YouTube's "confirm you're not a bot" challenge.

Paying for Pro doesn't change the fair-use rule.

So the media has to come from a server that **already exists and already proxies YouTube**, which means a **public Invidious instance with `local=true`**:

```
Browser ──► app.yourdomain (Vercel custom domain): UI + /api/xyz/* JSON
Browser ──► public Invidious companion (e.g. jp1-cmp.invidious.f5.si): DASH manifest + video bytes
Vercel  ──► public Invidious API: search / metadata / comments / captions (JSON, cached)
Only the Invidious instance talks to YouTube.
```

**Verified on 2026-10-06** (test video `jNQXAC9IVRw`, Origin `https://example.com`):

| Check | Result |
|---|---|
| `api.invidious.io/instances.json` | Only **`invidious.f5.si`** has `api: true, cors: true`. nadeko, nerdvpn, tiekoetter and chocolatemoo53 have the API off. |
| `GET invidious.f5.si/api/manifest/dash/id/:id?local=true` | `302` → `https://jp1-cmp.invidious.f5.si/companion/api/manifest/dash/id/:id?local=true` |
| Companion manifest | `200`, `access-control-allow-origin: *`, 2 audio/mp4 + 2 video/mp4 representations, `BaseURL` = **relative** `/companion/videoplayback?...` (so it resolves to the companion host, not googlevideo) |
| Segment `Range: bytes=0-65535` | `206 Partial Content`, `audio/mp4`, CORS `*`, `content-range: bytes 0-65535/309288` ✅ |
| `GET /api/v1/comments/:id` | `200`, JSON with comments ✅ |
| `GET /api/v1/videos/:id?local=true` | `200` but an **empty body**. Don't depend on it, and use the manifest + comments endpoints instead. |

**Honest risks (you accepted "no VM", so these can't be fixed, only mitigated):**
- Today there is **one** working public instance. If it closes CORS, its companion, or `local=true`, native playback stops until another instance appears. The design must degrade gracefully.
- It's a volunteer's bandwidth. The companion wiki asks clients to **respect instances that restrict these endpoints**, so don't hammer it, keep usage personal, and consider donating to the operator.
- The instance's domains might also get blocked in your country. Test from the real user network (Phase 0).
- Bypassing a national block may be illegal where users are, and stream extraction breaks YouTube's ToS. That's your call.

## 2. TODO

**Status 2026-10-06: Phases 1–3 implemented.** Verified in Chrome with every YouTube/Google host blocked: playback, seek and switching to 720p all work, all media comes from `jp1-cmp.invidious.f5.si`, and the page made 0 attempts to reach blocked hosts.

Lessons from implementing:
- The instance's 302 to its companion host fails CORS in browsers, so `/api/xyz/stream` resolves the redirect server-side (`resolveManifestUrl`).
- `/vi/` and `/ggpht/` on f5.si sit behind an Anubis bot check, so thumbnails and avatars stay on the small, CDN-cached Vercel image proxy (server → Google, never browser → Google).
- f5.si returns empty bodies for `/api/v1/videos/:id` and `/api/v1/captions`, so related videos, storyboards and captions fall back or are hidden for now.

Still open:
- the comments UI (Phase 4; the API route is done)
- the custom-instance setting skips server-side redirect resolution, so that instance must serve the manifest with CORS directly
- the daily directory refresh via Vercel cron (discovery currently runs lazily, with a 6 h in-memory cache plus CDN caching)
- Playwright specs in the repo (the checks so far were ad-hoc scripts)

### Phase 0: Confirm from the blocked network (15 min)
- [ ] On a user's machine, open `https://jp1-cmp.invidious.f5.si/companion/api/manifest/dash/id/jNQXAC9IVRw?local=true`. You should see XML.
- [ ] Open `https://invidious.f5.si/vi/jNQXAC9IVRw/mqdefault.jpg`. You should see an image (thumbnail proxy).
- [ ] Confirm `app.yourdomain` loads. Use a **custom domain**, because `*.vercel.app` is blocked in some countries.

### Phase 1: Instance registry (`lib/providers/instances.ts`)
- [ ] Hard-code the known-good list `["https://invidious.f5.si"]`.
- [ ] Add a Vercel cron (Hobby allows one run a day) or on-demand refresh that reads `https://api.invidious.io/instances.json?sort_by=health` and keeps `type === "https" && api && cors`. Probe each instance with a manifest fetch + 1 KB segment `Range` request (the same checks as in the table above) and store passing hosts in Edge Config, or just cache the list in a route with `s-maxage=86400`.
- [ ] `GET /api/xyz/instances` returns the ordered healthy list to the client.
- [ ] Add an optional user setting for a custom instance URL (for example a friend's or a self-hosted one later).

### Phase 2: Vercel JSON API (`app/api/xyz`)
- [ ] Split the 628-line `route.ts` into `{video,search,trending,related,stream,comments,captions}/route.ts` plus `lib/providers/invidious.ts` (typed, `AbortSignal.timeout`, tries instances in order).
- [ ] `GET /api/xyz/stream?id=` returns:
  - `{ manifestUrl: "<instance>/api/manifest/dash/id/:id?local=true", instance, thumbnails, storyboards?, captions? }`
  - Let the **browser** follow the 302 to the companion, so manifest and segments come from the same host.
  - **Never** return googlevideo URLs.
- [ ] `GET /api/xyz/comments?id=&sort=top|new&continuation=` → instance `/api/v1/comments/:id`. Normalise it, sanitise the HTML, rewrite author avatars to instance `/ggpht/...`, cache with `s-maxage=300`, and fall back to Data API `commentThreads.list` (1 unit, runs server-side, so it's fine) with avatars rewritten.
- [ ] Thumbnails: `<instance>/vi/{id}/mqdefault.jpg`, loaded by the browser directly. Delete the Vercel `?thumb=` proxy (media hot-linking through Vercel).
- [ ] Search, trending and related come from the instance API. The Data API (server-side) is the fallback, with thumbnails mapped to the instance.
- [ ] **Add a YouTube-host guard:** a final check on every response that throws if any URL host matches `/(youtube|ytimg|googlevideo|ggpht|googleusercontent|youtu\.be)/`.
- [ ] Remove `?key=` from the query string (read `process.env.XYZ_API_KEY` only), and validate the 11-char ID on every route.

### Phase 3: Player (Shaka, no iframe for blocked users)
- [ ] `bun add shaka-player`, lazy-loaded like `use-hls.ts`. Add `lib/hooks/use-shaka.ts`.
- [ ] Add a `PlaybackEngine` interface in `lib/types/player.ts` with `shaka` (default) and `iframe` (opt-in setting, only for users who can reach YouTube). Keep `player-controls.tsx` engine-agnostic.
- [ ] Failure ladder:
  1. On 403/410 (expired URL), re-request `/api/xyz/stream` and `player.load(manifest, currentTime)`.
  2. If that fails, move to the next healthy instance.
  3. If none are left, show the error card "No playback server available" with a retry button.
- [ ] Quality (`getVariantTracks`) and audio-language menus. Captions as `<track>` from `<instance>/api/v1/captions/:id?label=` (best-effort).
- [ ] Seek-bar previews only if the instance returns storyboards. Hide them otherwise.
- [ ] Ambient glow: use `crossOrigin="anonymous"` on `<video>` (CORS `*` allows canvas reads).
- [ ] MediaSession + native background playback, and drop the keepalive hack on the Shaka path.
- [ ] Remove all "Open on YouTube" / `youtube.com` links from the UI for this mode.

### Phase 4: Comments UI
- [ ] `app/_components/comments-panel.tsx`: top/new, `continuation` infinite scroll, lazy replies, `1:23` → seek, sanitised HTML (`a, b, i, br`).

### Phase 5: Be a good citizen (keeps the instance alive for you)
- [ ] Cache aggressively on Vercel for all JSON. Don't prefetch manifests for queue items, and don't prefetch beyond Shaka's default buffer (`streaming.bufferingGoal` around 30 s).
- [ ] Set a `User-Agent` / `Referer` that identifies your app on server calls, so the operator can contact or block you.
- [ ] Don't publish the app widely. Every user's video goes through someone else's server.

### Phase 6: Tests
- [ ] Vitest: instance health filter, normalisers (saved f5.si fixtures), the YouTube-host guard on every route, the failure ladder, and the comment sanitiser.
- [ ] Playwright with `page.route(/youtube|ytimg|googlevideo|ggpht/, r => r.abort())`: search → play → seek → quality → comments must all work. This simulates the blocked network.
- [ ] Playwright: block the instance host and assert the "No playback server" card plus retry.

## 3. If this proves too unreliable
Without your own server, the only alternative is to wait for or find more public instances. The real fix is a $0 self-hosted Invidious + Companion (home PC + Cloudflare Tunnel, or Oracle Always Free), and the Phase 1 custom-instance setting already supports plugging that in later without code changes.

## Sources
- Vercel: [Fair use](https://vercel.com/docs/limits/fair-use-guidelines), [Limits](https://vercel.com/docs/limits), [Function limits](https://vercel.com/docs/functions/limitations)
- [Invidious API](https://docs.invidious.io/api/), [public instances JSON](https://api.invidious.io/instances.json?sort_by=health), [invidious#6036](https://github.com/iv-org/invidious/issues/6036)
- [Invidious Companion wiki (HTTP API, respect instance restrictions)](https://github.com/iv-org/invidious-companion/wiki)
- [yt-dlp PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide), [Shaka Player](https://github.com/shaka-project/shaka-player)
