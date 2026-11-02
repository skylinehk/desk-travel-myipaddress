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
