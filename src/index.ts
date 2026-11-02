interface Env {}

type RequestCf = IncomingRequestCfProperties & {
  city?: string;
  country?: string;
  continent?: string;
  latitude?: string;
  longitude?: string;
  postalCode?: string;
  region?: string;
  regionCode?: string;
  timezone?: string;
  asn?: number;
  colo?: string;
  httpProtocol?: string;
  tlsVersion?: string;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);

const valueOr = (value: unknown, fallback = "Unavailable"): string => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const addressLine = (cf: RequestCf): string => {
  const parts = [cf.city, cf.region, cf.postalCode, cf.country]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "Approximate area unavailable";
};

const render = (request: Request): Response => {
  const cf = (request.cf ?? {}) as RequestCf;
  const ip = valueOr(request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For"));
  const latitude = String(cf.latitude ?? "").trim();
  const longitude = String(cf.longitude ?? "").trim();
  const mapUrl = latitude && longitude
    ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=12/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`
    : "https://www.openstreetmap.org/";
  const visitedAt = new Date().toISOString();

  console.log(JSON.stringify({
    event: "myipaddress.visit",
    ip,
    approximateAddress: addressLine(cf),
    latitude: latitude || null,
    longitude: longitude || null,
    country: cf.country ?? null,
    city: cf.city ?? null,
    colo: cf.colo ?? null,
    visitedAt,
  }));

  const rows: Array<[string, string, string?]> = [
    ["IP address", ip, "ip"],
    ["Approximate address", addressLine(cf)],
    ["Coordinates", latitude && longitude ? `${latitude}, ${longitude}` : "Unavailable"],
    ["Network", cf.asn ? `AS${cf.asn}` : "Unavailable"],
    ["Time zone", valueOr(cf.timezone)],
    ["Edge", valueOr(cf.colo)],
  ];

  const rowMarkup = rows.map(([label, value, className]) => `
    <div class="row">
      <dt>${escapeHtml(label)}</dt>
      <dd class="${className ?? ""}">${escapeHtml(value)}</dd>
    </div>`).join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>My IP address</title>
<style>
:root{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace;color:#ebf4ff;background:#071018;line-height:1.4}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;overflow-x:hidden;background:radial-gradient(circle at 75% 12%,#17455b 0,transparent 38%),linear-gradient(135deg,#071018 0%,#0b1621 55%,#081019 100%)}body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.35;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:36px 36px;mask-image:linear-gradient(to bottom,black,transparent 78%)}main{width:min(680px,calc(100vw - 32px));padding:28px 0 32px;position:relative}.eyebrow{display:flex;align-items:center;gap:10px;color:#8ea8b8;font-size:11px;letter-spacing:.14em;text-transform:uppercase}.dot{width:7px;height:7px;border-radius:50%;background:#5df2a7;box-shadow:0 0 18px #5df2a7;animation:pulse 2.2s ease-in-out infinite}@keyframes pulse{0%,100%{opacity:.55;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}h1{font:600 clamp(32px,7vw,58px)/1.02 ui-sans-serif,system-ui,sans-serif;letter-spacing:-.06em;margin:18px 0 24px;color:#fff}.card{position:relative;border:1px solid rgba(181,218,240,.17);border-radius:18px;background:linear-gradient(135deg,rgba(18,37,51,.9),rgba(10,22,31,.76));box-shadow:0 24px 80px rgba(0,0,0,.3),inset 0 1px rgba(255,255,255,.06);overflow:hidden}.card:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 24%,rgba(115,212,255,.08) 40%,transparent 54%);transform:translateX(-100%);animation:sheen 8s ease-in-out infinite}@keyframes sheen{0%,64%{transform:translateX(-100%)}84%,100%{transform:translateX(100%)}}.card-head{display:flex;align-items:center;justify-content:space-between;padding:17px 20px;border-bottom:1px solid rgba(181,218,240,.12);color:#9eb8c8;font-size:11px;letter-spacing:.1em;text-transform:uppercase}.status{color:#72f0af;display:flex;align-items:center;gap:8px}.rows{padding:4px 20px 10px}.row{display:grid;grid-template-columns:170px 1fr;gap:18px;padding:15px 0;border-bottom:1px solid rgba(181,218,240,.1)}.row:last-child{border-bottom:0}dt{color:#82a0b1;font-size:12px}dd{margin:0;color:#edf6fb;font-size:13px;overflow-wrap:anywhere}.ip{font:600 24px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:-.03em;color:#fff}.actions{display:flex;flex-wrap:wrap;gap:10px;padding:4px 20px 20px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border:1px solid rgba(181,218,240,.2);border-radius:9px;padding:0 14px;color:#d9ebf6;background:rgba(151,210,235,.08);font:600 12px ui-monospace,monospace;text-decoration:none;cursor:pointer;transition:.2s ease}.button:hover,.button:focus-visible{border-color:#6ee7ff;color:#fff;background:rgba(110,231,255,.14);transform:translateY(-1px)}.meta{margin:15px 2px 0;color:#678092;font-size:11px}.copied{color:#72f0af}@media(max-width:520px){main{width:min(100% - 24px,680px)}h1{margin:14px 0 19px}.row{grid-template-columns:1fr;gap:6px;padding:13px 0}.ip{font-size:22px}.actions{padding-bottom:16px}.card-head{padding:15px 16px}.rows,.actions{padding-left:16px;padding-right:16px}}
[hidden]{display:none!important}.button:disabled{cursor:wait;opacity:.6;transform:none}.location-status{margin:0;padding:0 20px 16px;color:#edc58d;font-size:12px}.accuracy{display:block;color:#82a0b1;margin-top:4px}@media(prefers-reduced-motion:reduce){*,*:after{animation:none!important;transition:none!important}}
</style>
</head>
<body><main>
<h1>My IP address</h1>
<section class="card" aria-label="Request details">
<div class="card-head"><span>Connection details</span><span class="status"><span class="dot"></span>Logged</span></div>
<dl class="rows">${rowMarkup}<div class="row" id="device-location" hidden><dt>Device location</dt><dd role="status"><span id="device-coordinates"></span><span class="accuracy" id="device-accuracy"></span></dd></div></dl>
<div class="actions"><button class="button" id="copy" type="button">Copy IP</button><button class="button" id="locate" type="button">Use my location</button><a class="button" id="map" href="${escapeHtml(mapUrl)}" target="_blank" rel="noreferrer">Open map</a></div>
<p class="location-status" id="location-status" role="status" hidden></p>
</section>
</main>
<script>
const copyButton = document.getElementById('copy');
copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(${JSON.stringify(ip)});
    copyButton.textContent = 'Copied';
  } catch {
    copyButton.textContent = 'Copy failed';
  }
  setTimeout(() => { copyButton.textContent = 'Copy IP'; }, 1400);
});
const locateButton = document.getElementById('locate');
const locationStatus = document.getElementById('location-status');
const locationRow = document.getElementById('device-location');
const mapLink = document.getElementById('map');
const ipMapUrl = mapLink.href;
const locationError = (message) => {
  locationStatus.textContent = message;
  locationStatus.hidden = false;
  locateButton.disabled = false;
  locateButton.textContent = 'Use my location';
};
locateButton.addEventListener('click', () => {
  if (locateButton.disabled) return;
  locationRow.hidden = true;
  locationStatus.hidden = true;
  mapLink.href = ipMapUrl;
  if (!navigator.geolocation) {
    locationError('Location unavailable');
    return;
  }
  locateButton.disabled = true;
  locateButton.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    document.getElementById('device-coordinates').textContent = coords.latitude.toFixed(5) + ', ' + coords.longitude.toFixed(5);
    document.getElementById('device-accuracy').textContent = 'Accuracy ±' + Math.ceil(coords.accuracy).toLocaleString() + ' m';
    mapLink.href = 'https://www.openstreetmap.org/?mlat=' + coords.latitude + '&mlon=' + coords.longitude + '#map=16/' + coords.latitude + '/' + coords.longitude;
    locationRow.hidden = false;
    locateButton.disabled = false;
    locateButton.textContent = 'Refresh location';
  }, (error) => {
    locationError(error.code === 1 ? 'Location blocked · allow in browser settings' : error.code === 3 ? 'Location timed out · try again' : 'Location unavailable · try again');
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
});
</script>
</body></html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "permissions-policy": "geolocation=(self)",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
};

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET" || !["", "/myipaddress"].includes(url.pathname.replace(/\/$/, ""))) {
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=UTF-8" } });
    }
    return render(request);
  },
};
