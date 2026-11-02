# desk.travel/myipaddress

A small Cloudflare Worker for `https://desk.travel/myipaddress`.

- Reads the connecting IP and Cloudflare geolocation metadata at the edge.
- Shows an approximate location, coordinates, network, timezone, and edge colo.
- Writes one structured `myipaddress.visit` record per page view to Cloudflare Worker observability logs.
- Uses OpenStreetMap for the map link.

The location is approximate. IP geolocation cannot identify a precise street address.

## Local checks

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm exec wrangler deploy --dry-run
```

## Device location

The page automatically requests one browser location fix on load. The browser requires permission (or an existing grant); the page discloses that allowed location is logged to Cloudflare. No location button, polling, or automatic retries are used. Denial leaves IP details available.

After permission, coordinates and accuracy appear and are posted once to the same-origin `/myipaddress/location` endpoint. The Worker validates numeric ranges, JSON content type, origin, and a 1 KiB body limit, then emits `myipaddress.location` to Cloudflare Worker observability with the connecting IP and server timestamp. A successful response changes the status to Location logged; failures stay visible and require reload to retry. Logs use the existing observability retention and sampling settings, not a permanent database.

Browser coordinates are client-provided and can be spoofed. They may come from GPS, Wi-Fi, or other signals and do not provide a street address. Open map shares coordinates with OpenStreetMap. No reverse-geocoding service or new dependency is used.

The page requires HTTPS (localhost also works). Cloudflare zone security challenges occur before this Worker and must be managed separately; a challenge on the POST is shown as a save failure.
