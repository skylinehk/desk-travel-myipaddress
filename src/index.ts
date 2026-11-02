import { clientScript } from "./client.ts";
import { correlation, edgeFields, isObject, jsonReply, originOnly, readJson, recordEvent } from "./events.ts";

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
  asOrganization?: string;
  botManagement?: { score?: number; verifiedBot?: boolean };
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
  const visitId = crypto.randomUUID();
  const edge = edgeFields(request);
  const referrer = originOnly(request.headers.get('referer'));
  const url = new URL(request.url);
  const campaign = (key: string) => {
    const value = url.searchParams.get(key);
    return value && /^[a-z0-9_-]{1,64}$/i.test(value) ? value : null;
  };

  console.log(JSON.stringify({
    event: "myipaddress.visit",
    schemaVersion: 1, visitId, eventId: visitId, ...edge, referrer,
    campaignSource: campaign("utm_source"), campaignMedium: campaign("utm_medium"),
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
  ];

  const rowMarkup = rows.map(([label, value, className]) => `
    <div class="row">
      <dt>${escapeHtml(label)}</dt>
      <dd class="${className ?? ""}">${escapeHtml(value)}</dd>
    </div>`).join("");

  const detailRow = (label: string, value: unknown, id?: string) => `<div class="row"><dt>${escapeHtml(label)}</dt><dd${id ? ` id="detail-${id}"` : ''}>${escapeHtml(valueOr(value))}</dd></div>`;
  const group = (label: string, rows: string) => `<section class="detail-group" aria-label="${label}"><h2>${label}</h2><dl>${rows}</dl></section>`;
  const clientRows = (fields: Array<[string, string]>) => fields.map(([label, id]) => detailRow(label, null, id)).join('');
  const networkDetails = [
    ['IP coordinates', latitude && longitude ? `${latitude}, ${longitude}` : null],
    ['Network', cf.asn ? `AS${cf.asn}` : null], ['Organization', cf.asOrganization],
    ['IP time zone', cf.timezone], ['Edge', cf.colo], ['HTTP', cf.httpProtocol], ['TLS', cf.tlsVersion],
    ['Request ID', edge.requestId], ['Referrer', referrer],
    ['Campaign source', campaign('utm_source')], ['Campaign medium', campaign('utm_medium')],
    ['Bot score', edge.botScore], ['Verified bot', typeof edge.verifiedBot === 'boolean' ? edge.verifiedBot ? 'Yes' : 'No' : null],
  ].map(([label, value]) => detailRow(String(label), value)).join('');
  const detailMarkup = group('Network', networkDetails) +
    group('Browser', clientRows([['Browser', 'browser'], ['OS', 'os'], ['Mobile', 'mobile'], ['Touch points', 'touchPoints'], ['Viewport', 'viewport'], ['Pixel ratio', 'pixelRatio'], ['Orientation', 'orientation'], ['Pointer', 'pointer']])) +
    group('Locale', clientRows([['Language', 'language'], ['Browser time zone', 'browserTimezone'], ['UTC offset', 'utcOffset'], ['Time zone mismatch', 'mismatch']])) +
    group('Connection estimates', clientRows([['Online', 'online'], ['Effective connection', 'connectionType'], ['RTT estimate', 'rtt'], ['Downlink estimate', 'downlink'], ['Data saver', 'saveData']])) +
    group('Performance', clientRows([['Navigation', 'navigationType'], ['TTFB', 'ttfb'], ['DOM ready', 'domReady'], ['Page load', 'load'], ['LCP', 'lcp'], ['CLS', 'cls'], ['INP estimate', 'inp']])) +
    group('Session', detailRow('Visit ID', visitId) + clientRows([['Tab session ID', 'sessionId'], ['Session storage', 'storageAvailable'], ['Visible time', 'visibleTime'], ['Copy IP clicks', 'copies'], ['Map clicks', 'maps'], ['Details opened', 'details'], ['Script errors', 'errors'], ['Location', 'locationOutcome'], ['Location time', 'locationTime'], ['IP-to-device distance', 'distance'], ['Telemetry', 'telemetryStatus']]));

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>My IP address</title>
<style>
:root{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace;color:#ebf4ff;background:#071018;line-height:1.4}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;overflow-x:hidden;background:radial-gradient(circle at 75% 12%,#17455b 0,transparent 38%),linear-gradient(135deg,#071018 0%,#0b1621 55%,#081019 100%)}body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.35;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:36px 36px;mask-image:linear-gradient(to bottom,black,transparent 78%)}main{width:min(680px,calc(100vw - 32px));padding:28px 0 32px;position:relative}.dot{width:7px;height:7px;border-radius:50%;background:#5df2a7;box-shadow:0 0 18px #5df2a7;}h1{font:600 clamp(32px,7vw,58px)/1.02 ui-sans-serif,system-ui,sans-serif;letter-spacing:-.06em;margin:18px 0 24px;color:#fff}.card{position:relative;border:1px solid rgba(181,218,240,.17);border-radius:18px;background:linear-gradient(135deg,rgba(18,37,51,.9),rgba(10,22,31,.76));box-shadow:0 24px 80px rgba(0,0,0,.3),inset 0 1px rgba(255,255,255,.06);overflow:hidden}.card-head{display:flex;align-items:center;justify-content:space-between;padding:17px 20px;border-bottom:1px solid rgba(181,218,240,.12);color:#9eb8c8;font-size:11px;letter-spacing:.1em;text-transform:uppercase}.status{color:#72f0af;display:flex;align-items:center;gap:8px}.rows{padding:4px 20px 10px}.row{display:grid;grid-template-columns:170px 1fr;gap:18px;padding:15px 0;border-bottom:1px solid rgba(181,218,240,.1)}.row:last-child{border-bottom:0}dt{color:#82a0b1;font-size:12px}dd{margin:0;color:#edf6fb;font-size:13px;overflow-wrap:anywhere}.ip{font:600 24px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:-.03em;color:#fff}.actions{display:flex;flex-wrap:wrap;gap:10px;padding:4px 20px 20px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border:1px solid rgba(181,218,240,.2);border-radius:9px;padding:0 14px;color:#d9ebf6;background:rgba(151,210,235,.08);font:600 12px ui-monospace,monospace;text-decoration:none;cursor:pointer;transition:.2s ease}.button:hover,.button:focus-visible{border-color:#6ee7ff;color:#fff;background:rgba(110,231,255,.14);transform:translateY(-1px)}@media(max-width:520px){main{width:min(100% - 24px,680px)}h1{margin:14px 0 19px}.row{grid-template-columns:1fr;gap:6px;padding:13px 0}.ip{font-size:22px}.actions{padding-bottom:16px}.card-head{padding:15px 16px}.rows,.actions{padding-left:16px;padding-right:16px}}
@keyframes appear{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes signal{0%,100%{opacity:.65;transform:scale(.9)}50%{opacity:1;transform:scale(1)}}@keyframes glint{0%,72%{transform:translateX(-180%);opacity:0}76%{opacity:.5}94%,100%{transform:translateX(420%);opacity:0}}.card{animation:appear .32s ease-out}.dot{animation:signal 3s ease-in-out infinite}.card-head{position:relative;overflow:hidden}.card-head:after{content:"";position:absolute;inset:0 auto 0 0;width:32%;pointer-events:none;background:linear-gradient(100deg,transparent,rgba(110,231,255,.14),transparent);animation:glint 12s ease-in-out infinite}summary{list-style:none;display:flex;align-items:center;justify-content:space-between}summary::-webkit-details-marker{display:none}summary:after{content:"";width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);transition:transform .18s ease}details[open]>summary:after{transform:rotate(225deg)}details[open] .detail-grid{animation:appear .18s ease-out}
details{border-top:1px solid rgba(181,218,240,.12)}summary{cursor:pointer;padding:16px 20px;font-size:12px;color:#b3cbd9;min-height:48px}summary:focus-visible{outline:2px solid #6ee7ff;outline-offset:-4px}.detail-grid{padding:0 20px 20px;display:grid;gap:20px}.detail-group h2{font:600 12px ui-monospace,monospace;color:#9eb8c8;margin:8px 0}.detail-group dl{margin:0}.detail-group .row{padding:9px 0}.detail-group dd{font-size:12px}.detail-group dt{font-size:11px}@media(max-width:520px){summary{padding:14px 16px}.detail-grid{padding:0 16px 16px}.detail-group .row{grid-template-columns:135px minmax(0,1fr);gap:10px}}
[hidden]{display:none!important}.button:disabled{cursor:wait;opacity:.6;transform:none}.location-status{margin:0;padding:0 20px 16px;color:#edc58d;font-size:12px}.accuracy{display:block;color:#82a0b1;margin-top:4px}@media(prefers-reduced-motion:reduce){*,*:after{animation:none!important;transition:none!important}}
</style>
</head>
<body><main data-visit="${visitId}" data-ip="${escapeHtml(ip)}" data-latitude="${escapeHtml(latitude)}" data-longitude="${escapeHtml(longitude)}" data-timezone="${escapeHtml(cf.timezone ?? '')}">
<h1>My IP address</h1>
<section class="card" aria-label="Request details">
<div class="card-head"><span>Connection details</span><span class="status"><span class="dot"></span>Logged</span></div>
<dl class="rows">${rowMarkup}<div class="row" id="device-location" hidden><dt>Device location</dt><dd role="status"><span id="device-coordinates"></span><span class="accuracy" id="device-accuracy"></span></dd></div></dl>
<div class="actions"><button class="button" id="copy" type="button">Copy IP</button><a class="button" id="map" href="${escapeHtml(mapUrl)}" target="_blank" rel="noreferrer">Open map</a></div>
<p class="location-status" id="location-status" role="status">Locating…</p>
<details id="details"><summary>Details</summary><div class="detail-grid">${detailMarkup}</div></details>
</section>
</main>
<script>${clientScript}</script>
</body></html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "permissions-policy": "geolocation=(self)",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
};

const recordLocation = async (request: Request): Promise<Response> => {
  const reply = jsonReply;
  const parsed = await readJson(request, 1024);
  if (parsed.status) return reply(parsed.status);
  const data = parsed.data;
  if (!isObject(data)) return reply(400);
  const ids = correlation(data, false);
  if (!ids) return reply(400);
  const { latitude, longitude, accuracy } = data;
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || typeof accuracy !== 'number' ||
      ![latitude, longitude, accuracy].every(Number.isFinite) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0) return reply(400);
  if (data.locationMs !== undefined && (typeof data.locationMs !== 'number' || !Number.isFinite(data.locationMs) || data.locationMs < 0 || data.locationMs > 31536000000)) return reply(400);
  const edge = edgeFields(request);
  let distanceKm: number | null = null;
  if (edge.latitude != null && edge.longitude != null) {
    const lat = Number(edge.latitude), lon = Number(edge.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const rad = (value: number) => value * Math.PI / 180;
      const a = Math.sin(rad(latitude - lat) / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(latitude)) * Math.sin(rad(longitude - lon) / 2) ** 2;
      distanceKm = Math.round(6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) * 10) / 10;
    }
  }
  console.log(JSON.stringify({
    event: 'myipaddress.location', schemaVersion: 1, ...ids,
    source: 'browser',
    ip: valueOr(request.headers.get('CF-Connecting-IP')),
    latitude, longitude, accuracy,
    acquisitionMs: data.locationMs ?? null, ipLatitude: edge.latitude, ipLongitude: edge.longitude, distanceKm,
    recordedAt: new Date().toISOString(),
  }));
  return reply(200, true);
};

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/myipaddress/events") return recordEvent(request);
    if (request.method === "POST" && url.pathname === "/myipaddress/location") return recordLocation(request);
    if (request.method !== "GET" || !["", "/myipaddress"].includes(url.pathname.replace(/\/$/, ""))) {
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=UTF-8" } });
    }
    return render(request);
  },
};
