// Public browser telemetry is diagnostic data, never identity or authentication.
export const jsonReply = (status: number, logged = false) => Response.json({ logged }, {
  status, headers: { 'cache-control': 'no-store' },
});

export async function readJson(request: Request, limit: number): Promise<{ data?: unknown; status?: number }> {
  if (request.headers.get('origin') !== new URL(request.url).origin) return { status: 403 };
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return { status: 415 };
  const reader = request.body?.getReader();
  if (!reader) return { status: 400 };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return { status: 413 }; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { data: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch { return { status: 400 }; }
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function correlation(data: Record<string, unknown>, required = true): Record<string, string> | null {
  const result: Record<string, string> = {};
  for (const field of ['visitId', 'sessionId', 'eventId']) {
    const value = data[field];
    if (!required && value === undefined) continue;
    if (typeof value !== 'string' || !uuid.test(value)) return null;
    result[field] = value;
  }
  return result;
}

const stringFields = ['browser', 'browserVersion', 'os', 'language', 'browserTimezone', 'orientation', 'pointer', 'navigationType'];
const numberLimits: Record<string, [number, number]> = {
  viewportWidth: [0, 100000], viewportHeight: [0, 100000], pixelRatio: [0, 100],
  utcOffset: [-840, 840], touchPoints: [0, 100], rtt: [0, 1000000], downlink: [0, 1000000],
  ttfb: [0, 86400000], domReady: [0, 86400000], load: [0, 86400000], lcp: [0, 86400000],
  locationMs: [0, 31536000000], cls: [0, 1000000], inp: [0, 86400000], visibleMs: [0, 31536000000],
  copies: [0, 1000000], maps: [0, 1000000], details: [0, 1000000], errors: [0, 1000000], sequence: [0, 1000000],
};
const booleanFields = ['mobile', 'online', 'saveData', 'storageAvailable'];
const connectionTypes = ['slow-2g', '2g', '3g', '4g'];

export function cleanFields(input: unknown): Record<string, unknown> | null {
  if (!isObject(input)) return null;
  const result: Record<string, unknown> = {};
  for (const key of [...stringFields, ...Object.keys(numberLimits), ...booleanFields, 'connectionType']) {
    const value = input[key];
    if (value === undefined) continue;
    if (value === null) { result[key] = null; continue; }
    if (stringFields.includes(key)) {
      if (typeof value !== 'string' || value.length > 100 || /[\x00-\x1f]/.test(value)) return null;
    } else if (key in numberLimits) {
      const [min, max] = numberLimits[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return null;
    } else if (booleanFields.includes(key)) {
      if (typeof value !== 'boolean') return null;
    } else if (!connectionTypes.includes(String(value))) return null;
    result[key] = value;
  }
  return result;
}

export const originOnly = (value: string | null): string | null => {
  try { const url = new URL(value ?? ''); return ['http:', 'https:'].includes(url.protocol) ? url.origin : null; }
  catch { return null; }
};

export function edgeFields(request: Request): Record<string, unknown> {
  const cf = (request.cf ?? {}) as IncomingRequestCfProperties & {
    asOrganization?: string; botManagement?: { score?: number; verifiedBot?: boolean };
  };
  return {
    ip: request.headers.get('CF-Connecting-IP') || 'Unavailable',
    asn: cf.asn ?? null, organization: cf.asOrganization ?? null,
    country: cf.country ?? null, region: cf.region ?? null, city: cf.city ?? null,
    latitude: cf.latitude ?? null, longitude: cf.longitude ?? null,
    timezone: cf.timezone ?? null, colo: cf.colo ?? null,
    protocol: cf.httpProtocol ?? null, tls: cf.tlsVersion ?? null,
    requestId: request.headers.get('cf-ray')?.slice(0, 100) ?? null,
    botScore: cf.botManagement?.score ?? null, verifiedBot: cf.botManagement?.verifiedBot ?? null,
  };
}

export async function recordEvent(request: Request): Promise<Response> {
  const parsed = await readJson(request, 8192);
  if (parsed.status) return jsonReply(parsed.status);
  const data = parsed.data;
  if (!isObject(data) || data.schemaVersion !== 1 || !['client', 'summary', 'location_error'].includes(String(data.event))) return jsonReply(400);
  const ids = correlation(data);
  const fields = cleanFields(data.fields);
  if (!ids || !fields) return jsonReply(400);
  if (data.event === 'location_error' && !['denied', 'unavailable', 'timeout', 'unsupported'].includes(String(data.outcome))) return jsonReply(400);
  const edge = edgeFields(request);
  const record: Record<string, unknown> = {
    event: `myipaddress.${data.event}`, schemaVersion: 1, ...ids, ...edge,
    source: 'browser', fields, receivedAt: new Date().toISOString(),
  };
  if (data.event === 'location_error') record.outcome = data.outcome;
  if (typeof fields.browserTimezone === 'string' && typeof edge.timezone === 'string') record.timezoneMismatch = fields.browserTimezone !== edge.timezone;
  console.log(JSON.stringify(record));
  return jsonReply(200, true);
}
