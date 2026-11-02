import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import worker from '../src/index.ts';

export async function page(geolocation, save = async () => ({ ok: true, json: async () => ({ logged: true }) }), options = {}) {
  const request = new Request('https://desk.travel/myipaddress');
  const response = await worker.fetch(request);
  const html = await response.text();
  const documentEvents = {}, windowEvents = {}, frames = [], idle = [], timers = [];
  const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, {
    hidden: true, open: false, textContent: '', href: 'https://www.openstreetmap.org/',
    addEventListener(type, handler) { this[type] = handler; },
  }]));
  const visitId = html.match(/data-visit="([^"]+)"/)[1];
  const document = {
    readyState: 'complete', visibilityState: 'visible',
    querySelector: () => ({ dataset: { visit: visitId, ip: '192.0.2.1', latitude: '0', longitude: '0', timezone: 'UTC' } }),
    getElementById: id => elements[id], addEventListener: (type, handler) => { documentEvents[type] = handler; },
  };
  let now = 0;
  const storage = options.storage ?? new Map();
  const observers = [];
  class Observer {
    static supportedEntryTypes = options.entryTypes ?? [];
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(config) { this.config = config; }
    takeRecords() { return []; }
  }
  runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    document, fetch: save, crypto: { randomUUID },
    navigator: { userAgent: 'Mozilla/5.0 Chrome/130.0.0.0', language: 'en-US', maxTouchPoints: 0, onLine: true,
      geolocation, clipboard: { writeText: async () => { throw new Error('Denied'); } } },
    sessionStorage: { getItem: key => { if (options.storageDenied) throw Error('Denied'); return storage.get(key); }, setItem: (key, value) => storage.set(key, value) },
    screen: { orientation: { type: 'portrait-primary' } }, innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
    matchMedia: () => ({ matches: false }), PerformanceObserver: Observer,
    performance: { now: () => now, getEntriesByType: () => [{ type: 'navigate', responseStart: 0, domContentLoadedEventEnd: 20, loadEventEnd: 30 }], interactionCount: 1 },
    addEventListener: (type, handler) => { windowEvents[type] = handler; },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    requestIdleCallback: callback => { idle.push(callback); },
    setTimeout: callback => { timers.push(callback); },
  });
  return {
    elements, response, html, visitId, observers, storage,
    resetCopy: () => timers.shift()(),
    flushFrames: () => { for (const callback of frames.splice(0)) callback(); },
    initialize: () => { for (const callback of idle.splice(0)) callback(); },
    setTime: value => { now = value; },
    visibility: state => { document.visibilityState = state; documentEvents.visibilitychange(); },
    windowEvent: (type, value) => windowEvents[type]?.(value),
  };
}
