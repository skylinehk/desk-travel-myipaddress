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

Use my location requests a single browser location fix after a click and browser permission. The page displays coordinates and accuracy, and Open map uses that location. Refresh location requests a fresh fix. Denied, unavailable, and timeout states allow retry; IP details remain available.

Device coordinates stay in page memory and are never sent to the Worker or its logs. Opening the map shares those coordinates with OpenStreetMap. Reloading clears them. Browser location may use GPS, Wi-Fi, or other device signals; it does not provide a street address. No reverse-geocoding service or new dependency is used.

The page requires HTTPS (localhost also works). Cloudflare zone security challenges occur before this Worker and must be managed separately.
