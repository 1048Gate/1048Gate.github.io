# Performance and data freshness

Base: latest main at `d053b6b3a628dbea736228cfd92f34dec7846cc3`. The original review file was unavailable. Measurements use the actual local built site in Chromium via agent-browser 0.21.4, with identical checked-in data, cold documents, no HTTP cache, and a fixture disabling the real Supabase client. They measure public static JSON, not Supabase traffic or production latency.

## Measured requests

| Initial homepage | Before | After |
| --- | ---: | ---: |
| JSON requests | 30 | 8 |
| Unique JSON paths | 15 | 8 |
| `seasons.json` requests | 8 | 1 |
| JSON transfer bytes (Resource Timing) | 361,792 | 85,800 |
| Decoded JSON bytes | 352,792 | 83,400 |

Requests fell 73%; measured transfer fell 76%. [Before](requests-before.json) and [after](requests-after.json) include every path and byte count. Resource Timing transfer size includes browser-estimated HTTP overhead; the local server does not compress. Illustrative local DOMContentLoaded/last-JSON timings are in those files, and are not a production speed guarantee.

## Root causes and changes

- Independent consumers fetched the same archives without sharing in-flight work. `js/data-loader.js` offers explicit shared fetching; consumers retain their native-fetch fallback when used independently. Each receives an independent Response clone. A five-minute, in-memory cache is limited to an archive allowlist. Current scores, homepage payload, season configuration, newspaper files, and odds are never retained after their in-flight request completes. Authenticated, non-GET, external, custom-header, and AbortSignal requests bypass sharing. Global fetch is not patched.
- `gateData.invalidate(path)` or `invalidate()` discards cached and in-flight generations. Superseded responses reject rather than populate a newer cache. Failures, HTTP errors and malformed JSON are not retained. Period-specific URLs and existing view generations remain independent.
- History overview, seasons, champions, records, rivalries, drafts and playoff simulations loaded while hidden. They now load on opening their sections. The existing year-selection race guards remain, and draft selection gains equivalent guards and year validation. The normal home historical notes and banners still load because they are visible homepage content.
- Transaction retrieval synthesized a current timestamp and presented it as an update. It now says Archive retrieved and explicitly states that source collection time is unavailable. Both homepage transaction consumers wait for a validated season, reject wrong-season responses, and ignore obsolete requests.
- The scoreboard loaded once. Its compact Refresh scores control fetches only the published `current-season.json`. Returning to a visible homepage tab after at least a minute requests a fresh snapshot. Concurrent refreshes share one operation; repeated attempts have a one-minute minimum interval; hidden pages start no refresh. There is no polling timer or direct ESPN/Supabase refresh call.
- Incoming boards must agree with configured season/week, contain twelve unique standings identities and six complete matchups, and have finite records/scores and consistent projection totals. Older score/projection timestamps, malformed files and incompatible periods are rejected. A failed refresh preserves the last valid display and warns clearly. Unchanged snapshots are not rerendered; refreshing does not scroll.

## Time meanings

| Label | Meaning |
| --- | --- |
| ESPN live · Collected … / final/schedule collection date | The payload's original `fetchedAt` or derived `last_updated`, never retrieval time |
| File retrieved … | Browser retrieval/check time only |
| Publish time unavailable | Score payloads do not supply a successful publication timestamp; none is invented |
| Weekly edition published … | The newspaper index's existing `published_at`; it is not inferred from a score file |
| Stale projection snapshot | Retained same-period projections, using their original `projectionsFetchedAt` |

Live collections older than 45 minutes show delayed scores, with the existing 90-minute critical threshold; pregame schedules older than a day show stale schedule. Final results retain their collection date. Missing timestamps are unavailable, not just updated. Eastern formatting uses `America/New_York`, including DST. No metadata fields were added.

## Verification and boundaries

Regression suites exercise the real loader, strict validator and scoreboard renderer: concurrent requests, independent response bodies, expiration/invalidation, stale generations, malformed JSON/HTTP/network recovery, rapid 2024 → 2025 → 2024 selection, in-place period changes, live/final transitions, hidden/visible behavior, minimum intervals, invalid-data preservation, projection rollback rejection and original stale-projection timestamps. The static scoreboard renderer keeps the new control through existing publishing runs.

No newspaper generation or scheduling code, GitHub Actions schedule, ESPN collection, Supabase authentication/permissions/migrations, production data, or Phase 1 HTML escaping code is changed. Refresh events never reload newspaper content; primary newspaper entry and archives keep Phase 4 behavior. No dependencies or frameworks added.

The Phase 3 Supabase migration's production status remains unverified and is a separate release concern. It is not applied here. An already-open page rejects a published score file from a different configured period; reload season settings to adopt a rollover. Static-data refresh cannot repair upstream collection failures, and archive memoization does not automatically rerender an already-open historical view. No production deployment or merge is performed.
