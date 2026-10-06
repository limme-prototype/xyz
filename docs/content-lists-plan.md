# Content lists plan: default and "new" lists per section

Research date: 2026-10-06. Constraints: Vercel Hobby only, $0, and users where YouTube is blocked (the browser never talks to Google; the server may).

## 1. Findings (verified live unless marked)

| Source | Cost | What it gives | Verdict |
|---|---|---|---|
| **YouTube channel RSS** `https://www.youtube.com/feeds/videos.xml?channel_id=UC…` | Free, no key, no quota | The **15 newest uploads** with id, title, published date, **view count** (`media:statistics`) and description. Tested: VannDa, Tena and Heng Pitou all returned 15 entries, newest from 2026-10-05. | **Primary source for "new" lists.** No durations, and Shorts aren't flagged. |
| **YouTube Data API v3** (server key) | 10,000 units/day for most methods. `playlistItems.list`, `videos.list`, `channels.list` and `playlists.list` each cost **1 unit**. `search.list` has its **own cap of 100 calls/day** ([quota table](https://developers.google.com/youtube/v3/determine_quota_cost)). | `playlistItems.list` on a channel's uploads playlist (`UC…` → `UU…`) returns 50 items/page via `pageToken`. `videos.list?id=a,b,…` (≤50 ids) returns durations, views and HD thumbs. `videos.list?chart=mostPopular&regionCode=KH&videoCategoryId=10` gives Cambodia's trending music (not tested here, since I had no key). | **Use for full discographies, durations and KH charts.** Never use `search.list` for lists. |
| **Invidious** `/api/v1/channels/:id/videos`, `/playlists`, `/trending?region=KH` | Free, but public instances are unreliable | Channel videos: 60 items + continuation (worked on f5.si). Channel playlists: worked. `trending?region=KH&type=Music` returned **live streams and gaming junk with "0 views"**. | Fallback only. Don't use KH trending. |
| **Spotify Web API** | Free tier, OAuth | **Audio features, recommendations, related artists and featured/category playlists are dead for new apps since 2024-11-27** (403), and extended access needs 250K MAU ([report](https://dev.to/birrings/spotifys-audiofeatures-api-died-in-2024-heres-what-i-built-to-replace-it-3dn3), [Brizm](https://developers.brizm.dev/blog/spotify-api-changes-2026/)). It also gives **no YouTube video IDs**, and xyz plays YouTube. | **Skip.** |
| **Spring Boot + PostgreSQL** (from the pasted prompts) | Needs an always-on server | Not needed: the lists are small, read-mostly and cacheable. | **Skip.** It breaks the Vercel-only, $0 rule. |
| **Vercel Cron (Hobby)** | Free | **Once per day max**, ±59 min precision ([docs](https://vercel.com/docs/cron-jobs/usage-and-pricing)). | Optional daily warm-up. CDN `stale-while-revalidate` handles the rest. |

Channel IDs found (via Invidious channel search):

| Artist | Main channel | Auto "Topic" channel (audio-only uploads) |
|---|---|---|
| VannDa | `UCrmidtzX3ZPVxYRjTI6V6tA` (5.2M subs) | `UC5jVt0NCpJHk6F7VS6wPV_w` |
| Tena | `UCHxwBcGj5uwU6kw3g7DR7jg` (1.9M) | `UCBXLgyyRDk1F9ivRnRCPRuw` |
| Heng Pitou | `UCTjAygFmUTpADi9cNKayFgw` (469K) | `UCYQsTdR4xaTeJpAVTgSJg-A` |
| "Chen" | ambiguous: `SREY CHEN` `UCrq-IjtNMdmXrjHB_XZVzLg`, `Chen Nevrmind` `UCc2WRKEw9dc0fdsY0nluGIg` | Confirm which artist you mean. |

## 2. Design

**One config file declares every section; the server builds each list from layered sources and the CDN caches it.**

```ts
// lib/content/sections.ts
export const SECTIONS = [
  { id: "khmer-new",  label: "New Khmer",   sources: [{ kind: "channels", ids: ["UCrmidtzX3ZPVxYRjTI6V6tA", "UCHxwBcGj5uwU6kw3g7DR7jg", "UCTjAygFmUTpADi9cNKayFgw"] }], sort: "newest" },
  { id: "kh-trending", label: "Trending KH", sources: [{ kind: "chart", regionCode: "KH", categoryId: "10" }] },
  { id: "vannda",     label: "VannDa",      sources: [{ kind: "uploads", channelId: "UCrmidtzX3ZPVxYRjTI6V6tA", limit: 200 }] },
  { id: "lofi",       label: "Lo-fi",       sources: [{ kind: "playlist", playlistId: "PL…" }] },
] as const;
```

Resolving a section (`GET /api/xyz/sections/:id`):
1. **Default list:** a curated seed JSON in the repo (like today's catalog). It's returned instantly when every live source fails, so the UI is never empty.
2. **Dynamic list:**
   - `channels`: one RSS feed per channel (0 quota), fetched in parallel, merged, de-duplicated and sorted by `published`.
   - `uploads`: Data API `playlistItems.list` on `UU…`, paged by `pageToken` up to `limit`. At 1 unit/page, 1,000 songs cost 20 units.
   - `chart`: Data API `videos.list chart=mostPopular`. 1 unit.
   - `playlist`: Data API `playlistItems.list`, or Invidious `/api/v1/playlists/:id` as the keyless fallback.
3. **Enrich:** batch `videos.list` (50 ids = 1 unit) for durations, to drop Shorts (under 60s) and show lengths.
4. **Respond:** `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`. Vercel's CDN serves one cached copy to everyone and refreshes it in the background.

Quota math: 10 artist channels × (1 uploads page + 1 videos.list) = **20 units/refresh**. That's 480 units/day at hourly refresh, under 5% of the free 10,000.

Client: the filter tabs become the section labels and call `/api/xyz/sections/:id`. Show a skeleton, then the list, with "Load more" using the returned `pageToken`.

## 3. TODO

**Status 2026-10-06:** Phases 1–3 are implemented (`lib/content/sections.ts`, `lib/content/resolve.ts`, `lib/providers/youtube-rss.ts`, `lib/providers/youtube-data.ts`, `app/api/xyz/sections/[id]/route.ts`, plus the tabs and "Load more" in the UI).
- Without `XYZ_API_KEY`, artist tabs and New Khmer use RSS, and Trending KH falls back to an Invidious search.
- The seed JSON move was skipped: `XYZ_CATALOG_VIDEOS` stays the seed.
- Phase 4 is open.

### Phase 1: Config + RSS "new" lists (no key needed)
- [ ] Add `lib/content/sections.ts` (config above) and `lib/content/seed/*.json` (default lists, moved from `XYZ_CATALOG_VIDEOS`).
- [ ] Add `lib/providers/youtube-rss.ts`: fetch + parse the Atom feed (entry → `{id, title, published, views, description}`). Map thumbnails to `/api/xyz?thumb=`. Use a 5 s timeout and treat failure as an empty list.
- [ ] Add `app/api/xyz/sections/[id]/route.ts`: resolve sources, merge, de-dupe and sort, falling back to the seed. Run the YouTube-host guard on the output, and add CDN cache headers.
- [ ] UI: the filter tabs read from `SECTIONS`. "All" stays the curated seed.

### Phase 2: Data API enrichment (server key `XYZ_API_KEY`)
- [ ] Add `lib/providers/youtube-data.ts`: `uploadsPlaylistId(channelId)` (`UC`→`UU`), `playlistItems(id, pageToken)`, `videosById(ids[])` (chunks of 50), and `chart(region, category)`.
- [ ] Durations plus a Shorts filter (under 60s) on every list. Use HD thumbs through the thumb proxy.
- [ ] `kh-trending` section via `chart=mostPopular&regionCode=KH&videoCategoryId=10`.
- [ ] Quota guard: on `403 quotaExceeded`, serve the last cached list or the seed until midnight PT.

### Phase 3: Pagination + discographies
- [ ] `uploads` sources page with `pageToken` up to `limit` (VannDa: about 100 uploads).
- [ ] Return `{ items, nextPageToken }`. The client adds "Load more" or infinite scroll to the Up next queue.

### Phase 4: Optional
- [ ] Vercel cron (daily) hitting each section URL to warm the CDN before peak hours.
- [ ] Artist pages (`/artist/:channelId`) built from the same providers.
- [ ] Persist "what's new since last visit" per user with `localStorage` (no backend needed).

## 4. Open questions for you
1. Which sections do you want? Proposed: New Khmer, Trending KH, Lo-fi, Coding, plus one per artist.
2. Which "Chen" is the artist?
3. Is it OK to set a server-side `XYZ_API_KEY` on Vercel? Phase 1 works without one, but durations, charts and full discographies need it.
