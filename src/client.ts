// Inline, dependency-free client. DOM work is deferred until Details is opened.
export const clientScript = String.raw`
(() => {
  const main = document.querySelector('main');
  const visitId = main.dataset.visit;
  const makeId = () => crypto.randomUUID();
  let sessionId = makeId(), storageAvailable = false;
  try {
    const stored = sessionStorage.getItem('myipaddress.session');
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored || '')) sessionId = stored;
    else sessionStorage.setItem('myipaddress.session', sessionId);
    storageAvailable = true;
  } catch {}
  const ids = () => ({ visitId, sessionId, eventId: makeId() });
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const connection = navigator.connection;
  const ua = navigator.userAgent || '';
  const browserMatch = ua.match(/(Edg|OPR|Firefox|FxiOS|CriOS|Chrome|Version)\/([0-9]+)/);
  const families = { Edg: 'Edge', OPR: 'Opera', Firefox: 'Firefox', FxiOS: 'Firefox', CriOS: 'Chrome', Chrome: 'Chrome', Version: 'Safari' };
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iOS / iPadOS' : /Windows/.test(ua) ? 'Windows' : /Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  const readTimezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; } };
  const browserTimezone = readTimezone();
  const counts = { copies: 0, maps: 0, details: 0, errors: 0 };
  let visibleSince = document.visibilityState === 'visible' ? performance.now() : null;
  let visibleMs = 0, sequence = 0, hiddenSent = false, telemetryStatus = 'Pending';
  let locationOutcome = 'pending', distanceKm = null, locationMs = null;
  const metrics = { lcp: null, cls: null, inp: null };
  const observers = [];
  const supported = typeof PerformanceObserver !== 'undefined' ? PerformanceObserver.supportedEntryTypes || [] : [];
  const observe = (type, consume, options = {}) => {
    if (!supported.includes(type)) return;
    try {
      const observer = new PerformanceObserver(list => { consume(list.getEntries()); refresh(); });
      observer.observe({ type, buffered: true, ...options });
      observers.push({ observer, consume });
    } catch {}
  };
  let clsWindow = 0, clsStart = 0, clsLast = 0;
  const consumeShifts = entries => {
    for (const entry of entries) {
      if (entry.hadRecentInput) continue;
      if (entry.startTime - clsLast < 1000 && entry.startTime - clsStart < 5000) clsWindow += entry.value;
      else { clsWindow = entry.value; clsStart = entry.startTime; }
      clsLast = entry.startTime;
      metrics.cls = Math.max(metrics.cls || 0, clsWindow);
    }
  };
  const interactions = new Map();
  let interactionMin = Infinity, interactionMax = 0;
  const consumeInteractions = entries => {
    for (const entry of entries) {
      if (!entry.interactionId) continue;
      interactionMin = Math.min(interactionMin, entry.interactionId);
      interactionMax = Math.max(interactionMax, entry.interactionId);
      interactions.set(entry.interactionId, Math.max(interactions.get(entry.interactionId) || 0, entry.duration));
      if (interactions.size > 10) {
        const smallest = [...interactions].sort((a, b) => a[1] - b[1])[0];
        interactions.delete(smallest[0]);
      }
    }
    const durations = [...interactions.values()].sort((a, b) => b - a);
    const count = finite(performance.interactionCount) ?? (interactionMax ? (interactionMax - interactionMin) / 7 + 1 : 0);
    if (durations.length) metrics.inp = durations[Math.min(durations.length - 1, Math.floor(count / 50))];
  };
  function startObservers() {
    observe('largest-contentful-paint', entries => { if (entries.length) metrics.lcp = entries[entries.length - 1].startTime; });
    if (supported.includes('layout-shift')) metrics.cls = 0;
    observe('layout-shift', consumeShifts);
    observe('event', consumeInteractions, { durationThreshold: 16 });
  }
  const environment = () => {
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      browser: browserMatch ? families[browserMatch[1]] : null,
      browserVersion: browserMatch ? browserMatch[2] : null, os,
      mobile: navigator.userAgentData?.mobile ?? (/Mobi|Android|iPhone|iPad/.test(ua) || os === 'iOS / iPadOS'),
      touchPoints: finite(navigator.maxTouchPoints), language: navigator.language || null,
      browserTimezone, utcOffset: new Date().getTimezoneOffset(),
      viewportWidth: innerWidth, viewportHeight: innerHeight, pixelRatio: finite(devicePixelRatio),
      orientation: screen.orientation?.type || (innerWidth > innerHeight ? 'landscape' : 'portrait'),
      pointer: matchMedia('(pointer: coarse)').matches ? 'coarse' : matchMedia('(pointer: fine)').matches ? 'fine' : 'none',
      online: typeof navigator.onLine === 'boolean' ? navigator.onLine : null,
      connectionType: connection?.effectiveType || null, rtt: finite(connection?.rtt), downlink: finite(connection?.downlink),
      saveData: typeof connection?.saveData === 'boolean' ? connection.saveData : null, storageAvailable,
      navigationType: nav?.type || null,
      ttfb: nav ? finite(nav.responseStart) : null,
      domReady: nav?.domContentLoadedEventEnd > 0 ? nav.domContentLoadedEventEnd : null,
      load: nav?.loadEventEnd > 0 ? nav.loadEventEnd : null,
    };
  };
  const duration = () => Math.round(visibleMs + (visibleSince === null ? 0 : performance.now() - visibleSince));
  async function sendEvent(event, fields, outcome) {
    try {
      const response = await fetch('/myipaddress/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ schemaVersion: 1, event, ...ids(), fields, ...(outcome ? { outcome } : {}) }),
      });
      if (!response.ok || (await response.json()).logged !== true) throw new Error('Not saved');
      telemetryStatus = 'Saved';
    } catch { telemetryStatus = 'Not saved'; }
    refresh();
  }
  const empty = value => value === null || value === undefined || value === '' ? 'Unavailable' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value);
  const ms = value => value === null ? 'Unavailable' : Math.round(value).toLocaleString() + ' ms';
  let frame = null;
  const details = document.getElementById('details');
  function refresh() {
    if (!details.open || frame !== null) return;
    frame = requestAnimationFrame(() => { frame = null; renderDetails(); });
  }
  function renderDetails() {
    const e = environment();
    const fields = {
      browser: e.browser ? e.browser + ' ' + e.browserVersion : null, os: e.os, mobile: e.mobile,
      touchPoints: e.touchPoints, language: e.language, browserTimezone: e.browserTimezone,
      utcOffset: 'UTC' + (e.utcOffset <= 0 ? '+' : '−') + String(Math.floor(Math.abs(e.utcOffset) / 60)).padStart(2, '0') + ':' + String(Math.abs(e.utcOffset) % 60).padStart(2, '0'),
      viewport: e.viewportWidth + ' × ' + e.viewportHeight, pixelRatio: e.pixelRatio,
      orientation: e.orientation, pointer: e.pointer, online: e.online, connectionType: e.connectionType,
      rtt: ms(e.rtt), downlink: e.downlink === null ? null : e.downlink + ' Mbps', saveData: e.saveData,
      navigationType: e.navigationType, ttfb: ms(e.ttfb), domReady: ms(e.domReady), load: ms(e.load),
      lcp: ms(metrics.lcp), cls: metrics.cls === null ? null : metrics.cls.toFixed(3), inp: ms(metrics.inp),
      sessionId, storageAvailable: e.storageAvailable, visibleTime: Math.round(duration() / 1000) + ' s',
      copies: counts.copies, maps: counts.maps, details: counts.details, errors: counts.errors,
      locationOutcome, locationTime: ms(locationMs), distance: distanceKm === null ? null : distanceKm.toLocaleString() + ' km',
      mismatch: main.dataset.timezone && browserTimezone ? main.dataset.timezone !== browserTimezone : null,
      telemetryStatus,
    };
    for (const [key, value] of Object.entries(fields)) {
      const element = document.getElementById('detail-' + key);
      if (element) element.textContent = empty(value);
    }
  }
  details.addEventListener('toggle', () => { if (details.open) { counts.details++; refresh(); } });
  addEventListener('resize', refresh, { passive: true });
  addEventListener('online', refresh);
  addEventListener('offline', refresh);
  addEventListener('error', () => { counts.errors++; refresh(); });
  addEventListener('unhandledrejection', () => { counts.errors++; refresh(); });
  const copyButton = document.getElementById('copy');
  copyButton.addEventListener('click', async () => {
    counts.copies++;
    try { await navigator.clipboard.writeText(main.dataset.ip); copyButton.textContent = 'Copied'; }
    catch { copyButton.textContent = 'Copy failed'; }
    refresh();
    setTimeout(() => { copyButton.textContent = 'Copy IP'; }, 1400);
  });
  const mapLink = document.getElementById('map');
  mapLink.addEventListener('click', () => { counts.maps++; refresh(); });
  function summarize() {
    if (hiddenSent) return;
    hiddenSent = true;
    if (visibleSince !== null) { visibleMs += performance.now() - visibleSince; visibleSince = null; }
    for (const { observer, consume } of observers) consume(observer.takeRecords());
    void sendEvent('summary', { ...environment(), ...metrics, ...counts, visibleMs: duration(), sequence: ++sequence });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') summarize();
    else { hiddenSent = false; if (visibleSince === null) visibleSince = performance.now(); refresh(); }
  });
  addEventListener('pagehide', summarize);
  addEventListener('pageshow', event => {
    if (event.persisted) { hiddenSent = false; visibleSince = document.visibilityState === 'visible' ? performance.now() : null; refresh(); }
  });
  function initialize() {
    const idle = typeof requestIdleCallback === 'function' ? callback => requestIdleCallback(callback, { timeout: 1500 }) : callback => setTimeout(callback, 0);
    idle(() => { startObservers(); void sendEvent('client', environment()); });
  }
  if (document.readyState === 'complete') initialize();
  else addEventListener('load', initialize, { once: true });

  // Preserve the existing immediate, single-fix browser location flow.
  const locationStatus = document.getElementById('location-status');
  const locationRow = document.getElementById('device-location');
  const locationStarted = performance.now();
  const locationFailed = outcome => { locationOutcome = outcome; locationMs = Math.round(performance.now() - locationStarted); void sendEvent('location_error', { locationMs }, outcome); refresh(); };
  if (!navigator.geolocation) {
    locationStatus.textContent = 'Location unavailable';
    locationFailed('unsupported');
  } else {
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      document.getElementById('device-coordinates').textContent = coords.latitude.toFixed(5) + ', ' + coords.longitude.toFixed(5);
      document.getElementById('device-accuracy').textContent = 'Accuracy ±' + Math.ceil(coords.accuracy).toLocaleString() + ' m';
      mapLink.href = 'https://www.openstreetmap.org/?mlat=' + coords.latitude + '&mlon=' + coords.longitude + '#map=16/' + coords.latitude + '/' + coords.longitude;
      locationRow.hidden = false;
      locationOutcome = 'granted';
      locationMs = Math.round(performance.now() - locationStarted);
      const lat = Number(main.dataset.latitude), lon = Number(main.dataset.longitude);
      if (main.dataset.latitude && main.dataset.longitude && Number.isFinite(lat) && Number.isFinite(lon)) {
        const rad = value => value * Math.PI / 180;
        const a = Math.sin(rad(coords.latitude - lat) / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(coords.latitude)) * Math.sin(rad(coords.longitude - lon) / 2) ** 2;
        distanceKm = Math.round(6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) * 10) / 10;
      }
      locationStatus.textContent = 'Saving location…';
      refresh();
      try {
        const response = await fetch('/myipaddress/location', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, locationMs, ...ids() }),
        });
        if (!response.ok || (await response.json()).logged !== true) throw new Error('Not logged');
        locationStatus.textContent = 'Location logged';
      } catch { locationStatus.textContent = 'Location not saved'; }
    }, error => {
      locationStatus.textContent = error.code === 1 ? 'Location blocked' : error.code === 3 ? 'Location timed out' : 'Location unavailable';
      locationFailed(error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
})();
`;
