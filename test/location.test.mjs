import { test } from 'node:test';
import assert from 'node:assert/strict';
import { page } from '../support/browser.mjs';
import worker from '../src/index.ts';

test('location requests automatically once and posts only after permission success', async () => {
  let success, calls = 0, saves = 0;
  const { elements: e, response } = await page({ getCurrentPosition(ok, fail, options) {
    calls++; success = ok;
    assert.equal(options.enableHighAccuracy, true);
    assert.equal(options.timeout, 15000);
    assert.equal(options.maximumAge, 0);
  } }, async (url, options) => {
    saves++;
    assert.equal(url, '/myipaddress/location');
    assert.equal(options.method, 'POST');
    const payload = JSON.parse(options.body);
    assert.equal(payload.latitude, 51.5);
    assert.equal(payload.longitude, -0.12);
    assert.equal(payload.accuracy, 12.3);
    assert.ok(payload.visitId && payload.sessionId && payload.eventId);
    return { ok: true, json: async () => ({ logged: true }) };
  });
  assert.equal(calls, 1);
  assert.equal(saves, 0);
  assert.equal(response.headers.get('permissions-policy'), 'geolocation=(self)');
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
  await success({ coords: { latitude: 51.5, longitude: -0.12, accuracy: 12.3 } });
  assert.equal(saves, 1);
  assert.equal(e['device-coordinates'].textContent, '51.50000, -0.12000');
  assert.equal(e['device-accuracy'].textContent, 'Accuracy ±13 m');
  assert.equal(e['device-location'].hidden, false);
  assert.equal(e['location-status'].textContent, 'Location logged');
  assert.match(e.map.href, /mlat=51.5&mlon=-0.12/);
});

for (const [code, message] of [[1, 'Location blocked'], [2, 'Location unavailable'], [3, 'Location timed out']]) {
  test(`location error ${code} preserves IP map and never saves`, async () => {
    const { elements: e } = await page({ getCurrentPosition(ok, fail) { fail({ code }); } }, async (url, options) => {
      assert.equal(url, '/myipaddress/events');
      const data = JSON.parse(options.body);
      assert.equal(data.event, 'location_error');
      assert.equal('latitude' in data, false);
      assert.ok(['denied', 'timeout', 'unavailable'].includes(data.outcome));
      return { ok: true, json: async () => ({ logged: true }) };
    });
    assert.ok(e['location-status'].textContent.startsWith(message));
    assert.equal(e['device-location'].hidden, true);
    assert.equal(e.map.href, 'https://www.openstreetmap.org/');
  });
}

test('unsupported browser and clipboard denial show recoverable states', async () => {
  const { elements: e, resetCopy } = await page(undefined);
  assert.equal(e['location-status'].textContent, 'Location unavailable');
  await e.copy.click();
  assert.equal(e.copy.textContent, 'Copy failed');
  resetCopy();
  assert.equal(e.copy.textContent, 'Copy IP');
});

for (const save of [async () => { throw new Error('Offline'); }, async () => ({ ok: false }), async () => ({ ok: true, json: async () => { throw new Error('Challenge HTML'); } })]) {
  test('failed or challenged POST never reports location logged', async () => {
    let success;
    const { elements: e } = await page({ getCurrentPosition(ok) { success = ok; } }, save);
    await success({ coords: { latitude: 0, longitude: 0, accuracy: 1 } });
    assert.equal(e['device-location'].hidden, false);
    assert.equal(e['location-status'].textContent, 'Location not saved');
  });
}

function post(body, headers = {}) {
  return worker.fetch(new Request('https://desk.travel/myipaddress/location', {
    method: 'POST', headers: { origin: 'https://desk.travel', 'content-type': 'application/json', 'CF-Connecting-IP': '192.0.2.10', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
}

test('endpoint records validated browser coordinates with edge IP and timestamp', async t => {
  const records = [];
  t.mock.method(console, 'log', value => records.push(JSON.parse(value)));
  const response = await post({ latitude: 0, longitude: 0, accuracy: 0, ip: 'spoofed' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { logged: true });
  assert.equal(records.length, 1);
  assert.equal(records[0].event, 'myipaddress.location');
  assert.equal(records[0].ip, '192.0.2.10');
  assert.equal(records[0].latitude, 0);
  assert.equal(records[0].source, 'browser');
  assert.ok(Number.isFinite(Date.parse(records[0].recordedAt)));
});

test('invalid, oversized, and cross-origin requests never log', async t => {
  t.mock.method(console, 'log', () => assert.fail('Invalid input must not be logged'));
  for (const value of [null, {}, { latitude: 91, longitude: 0, accuracy: 1 }, { latitude: 0, longitude: -181, accuracy: 1 }, { latitude: '1', longitude: 0, accuracy: 1 }, { latitude: 0, longitude: 0, accuracy: -1 }, '{']) {
    assert.equal((await post(value)).status, 400);
  }
  assert.equal((await post(' '.repeat(1025))).status, 413);
  assert.equal((await post({}, { origin: 'https://example.com' })).status, 403);
  assert.equal((await post({}, { 'content-type': 'text/plain' })).status, 415);
});
