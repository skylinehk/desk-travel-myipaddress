# desk.travel/myipaddress

Dependency-free Cloudflare Worker at `https://desk.travel/myipaddress`.

## Page

IP and approximate address appear immediately. Copy IP and Open map remain available. A native **Details** disclosure folds all additional fields without JavaScript; dynamic values are updated only while it is open. Groups cover Network, Browser, Locale, Connection estimates, Performance and Session. Missing fields show Unavailable; valid zero and false values are preserved.

The existing location flow is retained: one immediate high-accuracy browser request, a 15-second timeout, no cached fix, no polling, and no automatic retry. Permission remains controlled by the browser. After a fix, coordinates and accuracy appear, the map uses that location, and `/myipaddress/location` logs it to Cloudflare. Reload retries a failed request. Opening the map shares the selected coordinates with OpenStreetMap.

## Collected fields

- Edge: IP, IP coordinates/approximate area, ASN, network organization, region, country, IP timezone, colo, HTTP/TLS version, request ID, and optional bot score/verified-bot flag when Cloudflare exposes them.
- Acquisition: referring **origin** only and restricted `utm_source`/`utm_medium` tags (1–64 letters, digits, underscores or hyphens). No arbitrary query strings, referrer paths, URL fragments or raw user agent are logged by application events. Cloudflare's invocation metadata is managed separately by Cloudflare and may contain request URLs.
- Browser: coarse browser family/major version, OS family, mobile hint, touch points, viewport, pixel ratio, orientation, pointer type, language, browser timezone and UTC offset.
- Connection: online hint and optional effective connection type, RTT/downlink estimates and data-saver setting. Unsupported APIs are null, not zero. These are browser estimates, not a speed test or reliable cellular/Wi-Fi detection.
- Performance: navigation type, navigation-start TTFB/DOM-ready/load timing, observed LCP, CLS using session windows, and an INP estimate using up to ten slowest interaction entries. Values are page-lifetime diagnostics, not a replacement for a complete Web Vitals library; unsupported/no-interaction values stay unavailable.
- Activity: cumulative visible duration, Copy IP/Open map counts, Details opens and script-error counts. No input text, clipboard reads, event recordings, fingerprint signatures or unrelated browsing data are captured.
- Location: the existing permitted fix, accuracy, acquisition time, source and server time; normalized denied/unavailable/timeout/unsupported outcomes are logged without coordinates.
- Derived fields: browser/IP timezone mismatch and IP-to-device great-circle distance when both coordinate sets exist. Neither proves VPN use or physical identity. Location precision is not a street address; coordinates can be spoofed.

## Correlation and delivery

`myipaddress.visit` is emitted on GET with a random server `visitId`. Browser events carry `schemaVersion: 1`, `visitId`, a tab-scoped random `sessionId`, and a unique `eventId`. IDs correlate diagnostic events and do not authenticate a visitor. Session storage survives reload; denied storage falls back to memory. Duplicated tabs can inherit session storage. There is no persistent cross-session identifier.

- `myipaddress.client`: one metadata event after load, scheduled during idle time (maximum idle delay 1.5 seconds).
- `myipaddress.location`: existing successful fix, now with optional correlation fields. Older already-open pages without IDs remain compatible.
- `myipaddress.location_error`: one normalized browser-location failure event.
- `myipaddress.summary`: one cumulative snapshot when the page becomes hidden. A following pagehide does not duplicate it. Visible duration excludes background time. Restoring resumes timing. Each snapshot has a sequence number; select the highest sequence per visit instead of summing cumulative snapshots. Event IDs allow duplicate detection in queries.

A normal visit uses two foreground POSTs (metadata and location result) plus one keepalive summary per visibility interval. No heartbeat, polling, auto-retry, framework, analytics SDK, extra permission category, database, or external fetch is added. Copy/map/detail clicks are counted in memory and included in the next summary. Closing a browser or an offline connection can lose final events; absence is unknown, not proof of no activity. Visible time updates on state changes/opening Details instead of running a timer.

The Worker accepts only same-origin JSON, validates IDs and numeric/string limits, allowlists telemetry fields and ignores unknown fields. Server time/IP cannot be overridden by client payloads. Body limits are 8 KiB for `/myipaddress/events` and 1 KiB for the existing location endpoint. Client telemetry is untrusted diagnostic data, never identity or fraud evidence. No public log-reading endpoint exists.

Records use the existing Cloudflare Worker observability logs and their account retention/sampling policy, not permanent storage. Live account retention and completeness are not guaranteed by this application. Cloudflare can attach its own metadata to invocations.

## Performance and motion

Single HTML response, system fonts, no third-party assets. Optional telemetry waits for idle time; observers use buffered platform APIs. Slow-interaction storage is bounded to ten entries. Details value rendering is gated by open state and batched with requestAnimationFrame. Native disclosure avoids custom accordion logic. Status pulse, a small header shimmer, entrance and disclosure motion use opacity/transform, with reduced-motion support. No height animation or full-card animated overlay.

## Checks and deploy

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm exec wrangler deploy --dry-run
pnpm deploy
```

Use Node 24+ for native TypeScript stripping in tests. `tsconfig.json` permits `.ts` imports for that test runtime; Wrangler bundles them for production. Desktop/mobile rendering, fold/unfold, console errors and representative live logs are release checks. Tests cover collection validation, correlation, location compatibility, failure states, unsupported APIs, timing windows, hidden time and duplicate-summary prevention.

Cloudflare zone challenges happen before the Worker and can affect either page or POST. Failed/challenged POSTs never show successful saves. Zone security policy is managed separately.
