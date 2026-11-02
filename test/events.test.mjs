import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import worker from '../src/index.ts';
import { page } from '../support/browser.mjs';

const ids = () => ({ visitId: randomUUID(), sessionId: randomUUID(), eventId: randomUUID() });
function post(data, headers = {}) {
  const request = new Request('https://desk.travel/myipaddress/events', {
    method: 'POST', headers: { origin: 'https://desk.travel', 'content-type': 'application/json', 'CF-Connecting-IP': '192.0.2.8', ...headers },
    body: typeof data === 'string' ? data : JSON.stringify(data),
  });
  Object.defineProperty(request, 'cf', { value: { asn: 64500, timezone: 'UTC', httpProtocol: 'HTTP/3' } });
  return worker.fetch(request);
}
const tick = () => new Promise(setImmediate);

test('telemetry is allowlisted and enriched with server IP and correlation', async t => {
  const records = [];
  t.mock.method(console, 'log', value => records.push(JSON.parse(value)));
  const identity = ids();
  const response = await post({ schemaVersion: 1, event: 'client', ...identity,
    ip: 'spoofed', receivedAt: 'spoofed', fields: { browser: 'Safari', browserTimezone: 'Asia/Tokyo', rtt: 0, saveData: false, load: null, secret: 'discard', latitude: 52 } });
  assert.equal(response.status, 200);
  assert.equal(records.length, 1);
  const record = records[0];
  assert.equal(record.ip, '192.0.2.8');
  assert.equal(record.visitId, identity.visitId);
  assert.equal(record.protocol, 'HTTP/3');
  assert.equal(record.fields.rtt, 0);
  assert.equal(record.fields.saveData, false);
  assert.equal(record.fields.load, null);
  assert.equal(record.timezoneMismatch, true);
  assert.equal(record.fields.secret, undefined);
  assert.equal(record.fields.latitude, undefined);
  assert.ok(Number.isFinite(Date.parse(record.receivedAt)));
});

test('invalid event schemas, payload limits and cross-origin inputs never log', async t => {
  t.mock.method(console, 'log', () => assert.fail('Must not log rejected payloads'));
  const valid = { schemaVersion: 1, event: 'summary', ...ids(), fields: {} };
  for (const invalid of [null, [], {}, { ...valid, event: 'unknown' }, { ...valid, visitId: 'bad' }, { ...valid, fields: { visibleMs: -1 } }, { ...valid, fields: { mobile: 'yes' } }, { ...valid, fields: { browser: 'a'.repeat(101) } }, { ...valid, fields: { load: 'zero' } }, { ...valid, event: 'location_error', outcome: 'fake' }, '{']) {
    assert.equal((await post(invalid)).status, 400);
  }
  assert.equal((await post(' '.repeat(8193))).status, 413);
  assert.equal((await post(valid, { origin: 'https://example.com' })).status, 403);
  assert.equal((await post(valid, { 'content-type': 'text/plain' })).status, 415);
});

test('visit records strip private referrer paths and arbitrary campaign parameters', async t => {
  const records = [];
  t.mock.method(console, 'log', value => records.push(JSON.parse(value)));
  const response = await worker.fetch(new Request('https://desk.travel/myipaddress?utm_source=newsletter&utm_medium=email&token=secret', {
    headers: { referer: 'https://example.com/private?token=secret' },
  }));
  const html = await response.text();
  assert.equal(records[0].referrer, 'https://example.com');
  assert.equal(records[0].campaignSource, 'newsletter');
  assert.equal(records[0].campaignMedium, 'email');
  assert.ok(!html.includes('token=secret'));
  assert.ok(!JSON.stringify(records).includes('secret'));
  assert.match(html, /<details id="details"><summary>Details<\/summary>/);
});

test('client waits for idle, does not transmit on Details toggle, and preserves zero/missing fields', async () => {
  const saves = [];
  const p = await page({ getCurrentPosition() {} }, async (url, options) => {
    saves.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ logged: true }) };
  });
  assert.equal(saves.length, 0);
  p.elements.details.open = true; p.elements.details.toggle(); p.flushFrames();
  assert.equal(saves.length, 0);
  assert.equal(p.elements['detail-touchPoints'].textContent, '0');
  assert.equal(p.elements['detail-rtt'].textContent, 'Unavailable');
  p.initialize(); await tick();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].event, 'client');
  assert.equal(saves[0].visitId, p.visitId);
  assert.equal(saves[0].fields.ttfb, 0);
  assert.equal(saves[0].fields.rtt, null);
});

test('summary excludes hidden time and deduplicates visibilitychange plus pagehide', async () => {
  const saves = [];
  const p = await page({ getCurrentPosition() {} }, async (url, options) => {
    saves.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ logged: true }) };
  });
  p.setTime(1000); p.visibility('hidden'); p.windowEvent('pagehide');
  await tick();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].fields.visibleMs, 1000);
  assert.equal(saves[0].fields.sequence, 1);
  p.setTime(9000); p.visibility('visible');
  await p.elements.copy.click();
  p.setTime(9500); p.visibility('hidden'); await tick();
  assert.equal(saves.length, 2);
  assert.equal(saves[1].fields.visibleMs, 1500);
  assert.equal(saves[1].fields.copies, 1);
  assert.equal(saves[1].fields.sequence, 2);
  assert.notEqual(saves[0].eventId, saves[1].eventId);
});

test('session survives reload but visit ID changes; denied storage still works', async () => {
  const p = await page({ getCurrentPosition() {} });
  const reload = await page({ getCurrentPosition() {} }, undefined, { storage: p.storage });
  p.elements.details.open = reload.elements.details.open = true;
  p.elements.details.toggle(); p.flushFrames(); reload.elements.details.toggle(); reload.flushFrames();
  assert.equal(p.elements['detail-sessionId'].textContent, reload.elements['detail-sessionId'].textContent);
  assert.notEqual(p.visitId, reload.visitId);
  const denied = await page({ getCurrentPosition() {} }, undefined, { storageDenied: true });
  denied.elements.details.open = true; denied.elements.details.toggle(); denied.flushFrames();
  assert.equal(denied.elements['detail-storageAvailable'].textContent, 'No');
  assert.match(denied.elements['detail-sessionId'].textContent, /^[0-9a-f-]{36}$/);
});

test('performance observers handle CLS windows, LCP and interaction estimates', async () => {
  const p = await page({ getCurrentPosition() {} }, undefined, { entryTypes: ['layout-shift', 'largest-contentful-paint', 'event'] });
  p.initialize();
  const byType = type => p.observers.find(observer => observer.config.type === type);
  byType('layout-shift').callback({ getEntries: () => [{ startTime: 100, value: .1, hadRecentInput: false }, { startTime: 200, value: .2, hadRecentInput: true }, { startTime: 800, value: .05, hadRecentInput: false }, { startTime: 6000, value: .1, hadRecentInput: false }] });
  byType('largest-contentful-paint').callback({ getEntries: () => [{ startTime: 80 }, { startTime: 150 }] });
  byType('event').callback({ getEntries: () => [{ interactionId: 7, duration: 32 }, { interactionId: 7, duration: 64 }] });
  p.elements.details.open = true; p.elements.details.toggle(); p.flushFrames();
  assert.equal(p.elements['detail-cls'].textContent, '0.150');
  assert.equal(p.elements['detail-lcp'].textContent, '150 ms');
  assert.equal(p.elements['detail-inp'].textContent, '64 ms');
});
