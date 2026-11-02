import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import worker from '../src/index.ts';

async function page(geolocation) {
  const response = await worker.fetch(new Request('https://desk.travel/myipaddress'));
  const html = await response.text();
  const elements = Object.fromEntries(['copy', 'locate', 'location-status', 'device-location', 'device-coordinates', 'device-accuracy', 'map'].map(id => [id, {
    hidden: true, disabled: false, textContent: '', href: 'https://www.openstreetmap.org/',
    addEventListener(type, handler) { this[type] = handler; },
  }]));
  let timer;
  runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    document: { getElementById: id => elements[id] },
    navigator: { geolocation, clipboard: { writeText: async () => { throw new Error('Denied'); } } },
    setTimeout: callback => { timer = callback; },
  });
  return { elements, response, resetCopy: () => timer() };
}

test('location is opt-in, single-shot, and updates coordinates, accuracy and map', async () => {
  let success, calls = 0;
  const { elements: e, response } = await page({ getCurrentPosition(ok, fail, options) {
    calls++; success = ok;
    assert.equal(options.enableHighAccuracy, true);
    assert.equal(options.timeout, 15000);
    assert.equal(options.maximumAge, 0);
  } });
  assert.equal(calls, 0);
  assert.equal(response.headers.get('permissions-policy'), 'geolocation=(self)');
  assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/);
  e.locate.click(); e.locate.click();
  assert.equal(calls, 1);
  assert.equal(e.locate.textContent, 'Locating…');
  success({ coords: { latitude: 51.5, longitude: -0.12, accuracy: 12.3 } });
  assert.equal(e['device-coordinates'].textContent, '51.50000, -0.12000');
  assert.equal(e['device-accuracy'].textContent, 'Accuracy ±13 m');
  assert.equal(e['device-location'].hidden, false);
  assert.equal(e.locate.disabled, false);
  assert.equal(e.locate.textContent, 'Refresh location');
  assert.match(e.map.href, /mlat=51.5&mlon=-0.12/);
  e.locate.click();
  assert.equal(calls, 2);
  assert.equal(e['device-location'].hidden, true);
  assert.equal(e.map.href, 'https://www.openstreetmap.org/');
});

for (const [code, message] of [[1, 'Location blocked'], [2, 'Location unavailable'], [3, 'Location timed out']]) {
  test(`location error ${code} preserves IP map and supports retry`, async () => {
    const { elements: e } = await page({ getCurrentPosition(ok, fail) { fail({ code }); } });
    e.locate.click();
    assert.ok(e['location-status'].textContent.startsWith(message));
    assert.equal(e['location-status'].hidden, false);
    assert.equal(e['device-location'].hidden, true);
    assert.equal(e.locate.disabled, false);
    assert.equal(e.map.href, 'https://www.openstreetmap.org/');
  });
}

test('unsupported browser and clipboard denial show recoverable states', async () => {
  const { elements: e, resetCopy } = await page(undefined);
  e.locate.click();
  assert.equal(e['location-status'].textContent, 'Location unavailable');
  await e.copy.click();
  assert.equal(e.copy.textContent, 'Copy failed');
  resetCopy();
  assert.equal(e.copy.textContent, 'Copy IP');
});
