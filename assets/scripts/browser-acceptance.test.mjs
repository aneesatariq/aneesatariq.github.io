// Optional real-browser acceptance. Requires an existing Playwright installation and Chromium.
// No site files are mutated: synchronized root/subpath/update/fault releases live in memory.
// Usage: set PLAYWRIGHT_MODULE to an absolute playwright/index.mjs path, then run with Node.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createProjections, createReleaseToken } from './sync-content.mjs';
import { renderSite, renderFallback } from './render-site.mjs';

if (process.argv[2] === '--lighthouse-report') {
  const report = JSON.parse(await readFile(process.argv[3], 'utf8'));
  console.log(JSON.stringify({ tool: report.lighthouseVersion, url: report.finalUrl, time: report.fetchTime, formFactor: report.configSettings.formFactor, scores: Object.fromEntries(Object.entries(report.categories).map(([key, value]) => [key, Math.round(value.score * 100)])), failed: Object.values(report.audits).filter((audit) => audit.score !== null && audit.score < 1).map(({ id, score, displayValue, details }) => ({ id, score, displayValue, items: details?.items })) }, null, 2));
  process.exit(0);
}
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = new URL('../../', import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const content = await json('assets/json/content.json');
const settings = await json('assets/json/settings.json');
const version = await json('assets/json/version.json');
const projections = await createProjections();
const worker = projections.get('sw.js');
const parseRelease = (source) => JSON.parse(source.split('const RELEASE = ')[1].split(';\n// GENERATED:RELEASE:END')[0]);
const originalRelease = parseRelease(worker);
const originals = new Map(await Promise.all(originalRelease.resources.map(async ({ path }) => [path, Buffer.from(projections.get(path) ?? await readFile(new URL(path, root)))])));
const hash = (bytes) => `sha256-${createHash('sha256').update(bytes).digest('base64')}`;

function fixture(path, revision = 0, { delayedActivation = false, pwa = true } = {}) {
  const config = structuredClone(settings);
  config.productionURL = `https://aneesatariq.github.io${path}`;
  config.features.pwa = pwa;
  const releaseVersion = { ...version, version: `${version.version}-browser.${revision}` };
  const { head, page } = renderSite(content, config, releaseVersion);
  const bytes = new Map(originals);
  const html = projections.get('index.html')
    .replace(/(<!-- GENERATED:HEAD:START -->)[\s\S]*?(<!-- GENERATED:HEAD:END -->)/, `$1\n${head}\n$2`)
    .replace(/(<!-- GENERATED:PAGE:START -->)[\s\S]*?(<!-- GENERATED:PAGE:END -->)/, `$1\n${page}\n$2`);
  bytes.set('index.html', Buffer.from(html));
  bytes.set('assets/json/settings.json', Buffer.from(JSON.stringify(config, null, 2) + '\n'));
  bytes.set('assets/json/version.json', Buffer.from(JSON.stringify(releaseVersion, null, 2) + '\n'));
  bytes.set('offline.html', Buffer.from(renderFallback(content, config, 'offline')));
  bytes.set('404.html', Buffer.from(renderFallback(content, config, 'notFound')));
  let source = delayedActivation ? worker.replace('event.waitUntil(self.skipWaiting());', 'event.waitUntil(new Promise(resolve => setTimeout(resolve, 1200)).then(() => self.skipWaiting()));') : worker;
  if (process.env.BROWSER_LIFECYCLE_TRACE) source = source.replace('const keys = await caches.keys();', `const keys = await caches.keys(); await fetch(new URL('__test_lifecycle__?version=' + RELEASE.version + '&keys=' + encodeURIComponent(JSON.stringify(keys)), BASE));`).replace('await caches.delete(CLIENT_CACHE);', `await caches.delete(CLIENT_CACHE); await fetch(new URL('__test_lifecycle__?version=' + RELEASE.version + '&cleanup=' + encodeURIComponent(JSON.stringify(await caches.keys())), BASE));`);
  const token = createReleaseToken(source, bytes);
  bytes.set('index.html', Buffer.from(html.replace('<meta name="portfolio-release-token" content="">', `<meta name="portfolio-release-token" content="${token}">`)));
  const resources = [...bytes].map(([name, data]) => ({ path: name, integrity: hash(data), bytes: data.length }));
  const release = { ...originalRelease, version: releaseVersion.version, token, resources, precacheBytes: resources.reduce((sum, entry) => sum + entry.bytes, 0) };
  bytes.set('sw.js', Buffer.from(source.replace(/const RELEASE = [\s\S]*?;\n\/\/ GENERATED:RELEASE:END/, `const RELEASE = ${JSON.stringify(release, null, 2)};\n// GENERATED:RELEASE:END`)));
  return { bytes, release, fault: '' };
}

const mounts = new Map([['/', fixture('/')], ['/portfolio/', fixture('/portfolio/')], ['/no-js/', fixture('/no-js/', 0, { pwa: false })]]);
const requests = [];
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', svg: 'image/svg+xml', jpg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  requests.push({ method: req.method, path: url.pathname, query: url.search });
  const mount = [...mounts.keys()].sort((a, b) => b.length - a.length).find((path) => url.pathname.startsWith(path));
  const snapshot = mounts.get(mount);
  const path = url.pathname.slice(mount.length) || 'index.html';
  if (path === '__test_lifecycle__') { console.log(`Lifecycle ${url.pathname}${url.search}`); res.end('fixture trace'); return; }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (path === 'api/check' || path === 'neighbor/check') { res.end(req.method); return; }
  if (path === 'assets/css/site.css' && snapshot.fault) {
    if (snapshot.fault === 'missing') { res.writeHead(404); res.end('Missing fixture stylesheet'); return; }
    if (snapshot.fault === 'redirect') { res.writeHead(302, { Location: `${mount}assets/css/site.css?redirected=1` }); res.end(); return; }
    if (snapshot.fault === 'modified') { res.writeHead(200, { 'Content-Type': types.css }); res.end('body { color: red; }'); return; }
  }
  const data = snapshot.bytes.get(path);
  if (!data) { res.writeHead(404, { 'Content-Type': types.html }); res.end(snapshot.bytes.get('404.html')); return; }
  res.writeHead(200, { 'Content-Type': types[path.split('.').at(-1)] || 'application/octet-stream' });
  res.end(data);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const outcomes = [];
async function check(name, test) {
  try { await test(); outcomes.push({ name, result: 'PASS' }); console.log(`PASS ${name}`); }
  catch (error) { outcomes.push({ name, result: 'FAIL', error: error.message }); console.error(`FAIL ${name}: ${error.stack}`); }
}
const contexts = [];
async function context(options = {}) { const result = await browser.newContext(options); result.setDefaultTimeout(15000); contexts.push(result); return result; }
async function until(probe, label, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await probe()) return; await new Promise((resolve) => setTimeout(resolve, 100)); }
  throw new Error(`Timed out: ${label}`);
}
async function enhanced(page, path = '/') {
  await page.goto(origin + path);
  try { await page.waitForSelector('[data-nav-ready="true"]'); }
  catch (error) { throw new Error(`${error.message}; page state ${JSON.stringify(await page.evaluate(() => ({ data: { ...document.documentElement.dataset }, title: document.title, text: document.body.innerText.slice(0, 120), release: document.querySelector('meta[name="portfolio-release"]')?.content })))}`); }
}
async function controlled(page) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 20000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
}
async function update(page) {
  await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
  await until(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state === 'installed'), 'waiting installed worker');
}
async function pin(page, token) {
  return page.evaluate((value) => new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => resolve(event.data.ok);
    navigator.serviceWorker.controller.postMessage({ type: 'PIN_RELEASE', token: value }, [channel.port2]);
  }), token);
}
const versionInPage = (page) => page.evaluate(() => document.querySelector('meta[name="portfolio-release"]').content);
const cacheNames = (page) => page.evaluate(() => caches.keys());
const releaseNames = (names, path) => names.filter((name) => name.startsWith(`aneesa-tariq-portfolio:${encodeURIComponent(path)}:release:`));

try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  console.log(`Browser ${browser.version()}; Playwright; fixture ${origin}; payload ${originalRelease.precacheBytes} bytes / ${originalRelease.resources.length} resources`);
  const errors = [];
  const uiContext = await context({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const ui = await uiContext.newPage();
  let initialNavigations = 0;
  ui.on('framenavigated', (frame) => { if (frame === ui.mainFrame()) initialNavigations += 1; });
  ui.on('pageerror', (error) => errors.push(error.message));
  ui.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await enhanced(ui);
  await controlled(ui);
  await check('clean initial activation never offers an update or reloads', async () => {
    await ui.waitForTimeout(300);
    assert.equal(await ui.locator('#pwa-banner[data-kind="update"]').isVisible(), false);
    assert.equal(await versionInPage(ui), mounts.get('/').release.version);
    assert.equal(initialNavigations, 1);
    const brand = await ui.locator('.brand').evaluate((link) => ({ text: link.textContent.replace(/\s+/g, ' ').trim(), label: link.getAttribute('aria-label') }));
    assert.ok(brand.label.includes(brand.text), `Visible brand text must occur in its accessible name: ${JSON.stringify(brand)}`);
  });

  await check('exact 320/375/768/1024/1440 viewports: no horizontal overflow, both portraits loaded', async () => {
    for (const width of [320, 375, 768, 1024, 1440]) {
      await ui.setViewportSize({ width, height: 900 });
      await ui.locator('#about').scrollIntoViewIfNeeded();
      await ui.waitForTimeout(120);
      const dimensions = await ui.evaluate(() => ({ width: innerWidth, client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, portraits: [...document.querySelectorAll('picture img')].map((img) => ({ loaded: img.complete && img.naturalWidth > 0, src: img.currentSrc, alt: img.alt })) }));
      console.log(JSON.stringify({ viewport: width, ...dimensions }));
      assert.equal(dimensions.width, width);
      assert.ok(dimensions.scroll <= dimensions.client, `overflow at ${width}: ${JSON.stringify(dimensions)}`);
      assert.equal(dimensions.portraits.length, 2);
      assert.ok(dimensions.portraits.every((img) => img.loaded && img.alt));
      if (process.env.BROWSER_SCREENSHOTS && [375, 1440].includes(width)) {
        await ui.evaluate(() => scrollTo(0, 0));
        await ui.screenshot({ path: fileURLToPath(new URL(`verification-${width}.png`, root)), fullPage: true });
      }
    }
  });
  await check('200% equivalent reflow (720 CSS pixels) and reduced motion', async () => {
    // Browser zoom halves the CSS viewport; CSS zoom alone does not change media queries.
    await ui.setViewportSize({ width: 720, height: 450 });
    const state = await ui.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, animation: getComputedStyle(document.querySelector('.hero-copy')).animationName, motion: matchMedia('(prefers-reduced-motion: reduce)').matches }));
    assert.ok(state.scroll <= state.client, JSON.stringify(state));
    assert.equal(state.animation, 'none');
    assert.equal(state.motion, true);
  });
  await check('mobile navigation: toggle, Escape, destination focus and current anchor', async () => {
    await ui.setViewportSize({ width: 375, height: 812 });
    await ui.locator('.menu-toggle').click();
    assert.equal(await ui.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
    await ui.keyboard.press('Escape');
    assert.equal(await ui.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
    assert.equal(await ui.evaluate(() => document.activeElement.className), 'menu-toggle');
    await ui.locator('.menu-toggle').click();
    await ui.locator('#primary-nav a[href="#services"]').click();
    assert.equal(await ui.locator('#primary-nav').isVisible(), false);
    assert.equal(await ui.evaluate(() => document.activeElement.id), 'services');
    assert.equal(new URL(ui.url()).hash, '#services');
  });
  await check('all portfolio/tool filters: counts, visible categories, aria-pressed', async () => {
    for (const group of await ui.locator('[data-filter-group]').all()) {
      for (const button of await group.locator('[data-filter]').all()) {
        await button.click();
        const category = await button.getAttribute('data-filter');
        const state = await group.evaluate((node) => ({ shown: [...node.querySelectorAll('[data-filter-item]')].filter((item) => !item.hidden).map((item) => item.dataset.categories), count: node.querySelector('[data-result-count]').textContent, pressed: node.querySelectorAll('[aria-pressed="true"]').length }));
        assert.ok(state.shown.every((categories) => category === 'all' || categories.split(' ').includes(category)));
        assert.ok(state.count.includes(String(state.shown.length)));
        assert.equal(state.pressed, 1);
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
      }
      await group.locator('[data-filter="all"]').click();
    }
  });
  await check('detail dialog Tab/Shift+Tab containment, Escape, original content and focus restored', async () => {
    const trigger = ui.locator('[data-open-scope]').first();
    const source = await trigger.getAttribute('data-open-scope');
    await trigger.click();
    assert.equal(await ui.locator('#scope-dialog').getAttribute('open'), '');
    for (const key of ['Tab', 'Tab', 'Shift+Tab']) {
      await ui.keyboard.press(key);
      assert.equal(await ui.evaluate(() => document.querySelector('#scope-dialog').contains(document.activeElement)), true, `${key}: ${await ui.evaluate(() => document.activeElement.outerHTML)}`);
    }
    await ui.keyboard.press('Escape');
    await ui.waitForFunction(() => !document.querySelector('#scope-dialog').open);
    assert.equal(await ui.evaluate(() => document.activeElement.dataset.openScope), source);
    await ui.locator(`#${source} .scope-detail-content`).waitFor({ state: 'attached' });
    assert.equal(await ui.locator(`#${source} .scope-detail-content`).count(), 1);
  });
  await check('denied clipboard: manual fallback selected, composer required/length validation and honest mailto feedback', async () => {
    await ui.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
    await ui.locator('[data-copy-email]').click();
    const fallback = ui.locator('[data-email-fallback] input');
    assert.equal(await fallback.isVisible(), true);
    assert.equal(await fallback.inputValue(), content.profile.email);
    assert.equal(await fallback.evaluate((input) => input.selectionEnd - input.selectionStart), content.profile.email.length);
    await ui.locator('[data-composer-disclosure] > summary').click();
    await ui.locator('#contact-composer button[type="submit"]').click();
    assert.equal(await ui.locator('#contact-composer [name="subject"]').getAttribute('aria-invalid'), 'true');
    assert.equal(await ui.evaluate(() => document.activeElement.name), 'subject');
    await ui.locator('[name="subject"]').fill('Collaboration & scope');
    await ui.locator('[name="message"]').fill('Hello Aneesa,\nLet’s discuss collaboration & responsibilities.');
    await ui.route('mailto:**', (route) => route.abort());
    await ui.locator('#contact-composer button[type="submit"]').click();
    assert.match(await ui.locator('#composer-status').textContent(), /not sent|does not send|has not sent/i);
    await ui.evaluate(() => { const field = document.querySelector('[name="subject"]'); field.value = 'x'.repeat(161); document.querySelector('#contact-composer').requestSubmit(); });
    assert.equal(await ui.locator('[name="subject"]').getAttribute('aria-invalid'), 'true');
  });
  await check('install guidance opens usable dialog; synthetic appinstalled hides install control', async () => {
    await ui.locator('[data-pwa-install]').click();
    if (await ui.locator('#scope-dialog').isVisible()) {
      assert.match(await ui.locator('#dialog-content').textContent(), /Safari|Home Screen|browser/i);
      await ui.keyboard.press('Escape');
    } else { console.log('Genuine native prompt available; no app installation attempted.'); }
    await ui.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    assert.equal(await ui.locator('[data-pwa-install]').isVisible(), false);
  });
  await check('synthetic install dismissal/standalone and unsupported/registration-failure paths', async () => {
    for (const mode of ['dismissed', 'standalone', 'unsupported', 'failure']) {
      const ctx = await context({ viewport: { width: 375, height: 812 } });
      await ctx.addInitScript((mode) => {
        if (mode === 'standalone') Object.defineProperty(navigator, 'standalone', { value: true });
        if (mode === 'unsupported') Object.defineProperty(window, 'isSecureContext', { value: false });
        if (mode === 'failure') navigator.serviceWorker.register = async () => { throw new Error('Registration denied by fixture'); };
      }, mode);
      const page = await ctx.newPage();
      await enhanced(page);
      await until(() => page.evaluate(() => Boolean(document.documentElement.dataset.pwaStatus)), 'PWA capability state');
      if (mode === 'standalone') assert.equal(await page.locator('[data-pwa-install]').isVisible(), false);
      if (['unsupported', 'failure'].includes(mode)) {
        assert.equal(await page.evaluate(() => document.documentElement.dataset.pwaStatus), mode === 'unsupported' ? 'unsupported' : 'unavailable');
        assert.equal(await page.locator('.contact-email').getAttribute('href'), `mailto:${content.profile.email}`);
        await page.locator('[data-pwa-install]').click();
        assert.equal(await page.locator('#scope-dialog').isVisible(), true);
        await page.keyboard.press('Escape');
      }
      if (mode === 'dismissed') {
        await page.evaluate(() => {
          const event = new Event('beforeinstallprompt', { cancelable: true });
          window.testPromptCalls = 0;
          event.prompt = async () => { window.testPromptCalls += 1; };
          event.userChoice = Promise.resolve({ outcome: 'dismissed' });
          window.testInstallEvent = event;
          dispatchEvent(event);
        });
        assert.equal(await page.evaluate(() => window.testPromptCalls), 0);
        await page.locator('[data-pwa-install]').click();
        await until(() => page.evaluate(() => window.testPromptCalls === 1), 'synthetic explicit install prompt');
        await page.evaluate(() => dispatchEvent(window.testInstallEvent));
        assert.equal(await page.locator('[data-pwa-install]').getAttribute('aria-haspopup'), 'dialog');
        assert.equal(await page.evaluate(() => window.testPromptCalls), 1);
      }
      await ctx.close();
    }
  });
  await check('no unexpected JavaScript runtime errors', async () => {
    assert.deepEqual(errors.filter((error) => !/mailto|Failed to launch|ERR_ABORTED/.test(error)), []);
  });

  await check('fresh no-JavaScript: complete sections, native details, contact and nested 404 links', async () => {
    const ctx = await context({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(origin + '/no-js/');
    assert.equal(await page.locator('main section').count(), 8);
    assert.equal(await page.locator('.portfolio-card').count(), content.portfolio.items.length);
    assert.equal(await page.locator('.tool-item').count(), content.tools.items.length);
    assert.equal(await page.locator('.contact-email').getAttribute('href'), `mailto:${content.profile.email}`);
    const details = page.locator('[data-scope-details]').first();
    await details.locator('summary').click();
    assert.equal(await details.getAttribute('open'), '');
    assert.equal(await details.locator('.scope-detail-content').isVisible(), true);
    assert.equal(await page.locator('#primary-nav').isVisible(), true);
    const response = await page.goto(origin + '/no-js/missing/nested');
    assert.equal(response.status(), 404);
    // Without JavaScript a preview needs the configured canonical base, as documented.
    assert.equal(await page.locator('base').getAttribute('href'), 'https://aneesatariq.github.io/no-js/');
    await ctx.close();
  });

  await check('welcome >=1.8s, desktop only, no focus theft, blocked-storage fallback, form/dialog suppression', async () => {
    for (const mode of ['desktop', 'mobile', 'denied', 'form', 'dialog']) {
      const ctx = await context({ viewport: { width: mode === 'mobile' ? 375 : 1440, height: 900 } });
      if (mode === 'denied') await ctx.addInitScript(() => { for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(window, name, { get() { throw new DOMException('Denied', 'SecurityError'); } }); });
      const page = await ctx.newPage();
      await enhanced(page);
      assert.equal(await page.locator('#welcome-panel').isVisible(), false);
      if (mode === 'form') await page.evaluate(() => { document.querySelector('[data-composer-disclosure]').open = true; document.querySelector('[name="subject"]').focus(); });
      if (mode === 'dialog') await page.locator('[data-open-scope]').first().evaluate((button) => button.click());
      const focus = await page.evaluate(() => document.activeElement.id);
      await page.waitForTimeout(2200);
      assert.equal(await page.locator('#welcome-panel').isVisible(), ['desktop', 'denied'].includes(mode), mode);
      assert.equal(await page.evaluate(() => document.activeElement.id), focus, mode);
      if (mode === 'desktop') {
        assert.ok(await page.evaluate(() => Object.keys(localStorage).some((key) => key.endsWith(location.origin + '/') && localStorage.getItem(key) === 'seen')));
        await page.locator('[data-dismiss-welcome]').click();
        await page.reload();
        await page.waitForTimeout(2200);
        assert.equal(await page.locator('#welcome-panel').isVisible(), false);
      }
      await ctx.close();
    }
  });

  await check('real root/subpath precache integrity, online 404 and offline 503/home/images at DPR 1/2', async () => {
    for (const path of ['/', '/portfolio/']) {
      const ctx = await context({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await enhanced(page, path);
      await controlled(page);
      const manifest = await page.evaluate(async () => (await (await fetch(document.querySelector('link[rel="manifest"]').href)).json()));
      assert.equal(manifest.id, '.');
      assert.equal(manifest.start_url, '.');
      assert.equal(manifest.scope, '.');
      assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
      const iconSizes = await page.evaluate(async (icons) => Promise.all(icons.map((icon) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(`${img.naturalWidth}x${img.naturalHeight}`); img.onerror = reject; img.src = icon.src; }))), manifest.icons);
      assert.deepEqual(iconSizes, manifest.icons.map((icon) => icon.sizes));
      const cached = await page.evaluate(async (prefix) => {
        const name = (await caches.keys()).find((key) => key.startsWith(prefix));
        const cache = await caches.open(name);
        return Promise.all((await cache.keys()).map(async (req) => { const res = await cache.match(req); const data = await res.arrayBuffer(); return { path: new URL(req.url).pathname, bytes: data.byteLength, integrity: 'sha256-' + btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', data)))) }; }));
      }, `aneesa-tariq-portfolio:${encodeURIComponent(path)}:release:`);
      assert.equal(cached.length, 29);
      for (const entry of mounts.get(path).release.resources) {
        const actual = cached.find((item) => item.path === path + entry.path);
        assert.equal(actual?.integrity, entry.integrity, entry.path);
        assert.equal(actual?.bytes, entry.bytes, entry.path);
      }
      console.log(JSON.stringify({ deployment: path, resources: cached.length, bytes: cached.reduce((sum, entry) => sum + entry.bytes, 0) }));
      const response = await page.goto(origin + path + 'missing/nested');
      assert.equal(response.status(), 404);
      assert.equal(await page.locator('base').getAttribute('href'), origin + path);
      await enhanced(page, path);
      await controlled(page);
      await ctx.setOffline(true);
      for (const leaf of ['', 'index.html', '?from=acceptance#about', 'index.html?test=1']) {
        const result = await page.goto(origin + path + leaf);
        assert.equal(result.status(), 200);
        await page.waitForSelector('[data-nav-ready="true"]');
      }
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.locator('#about').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => [...document.querySelectorAll('picture img')].every((img) => img.complete && img.naturalWidth > 0));
      }
      // Fetch JPEG as well as the browser's preferred WebP while genuinely offline.
      assert.equal(await page.evaluate(async (base) => (await fetch(base + 'assets/image/covers/about-1200.jpg')).status, path), 200);
      const missing = await page.goto(origin + path + 'offline/missing');
      assert.equal(missing.status(), 503);
      assert.equal(await page.locator('base').getAttribute('href'), origin + path);
      await ctx.setOffline(false);
      await ctx.close();
    }
  });

  const lifecycle = await context({ viewport: { width: 1440, height: 900 } });
  const first = await lifecycle.newPage();
  const second = await lifecycle.newPage();
  await enhanced(first, '/portfolio/');
  await controlled(first);
  await enhanced(second, '/portfolio/');
  await controlled(second);
  const old = mounts.get('/portfolio/');
  await check('scope isolation: unknown API and POST network-only, neighboring path, fresh version bypass', async () => {
    const before = await cacheNames(first);
    const count = requests.length;
    assert.equal(await first.evaluate(async () => (await fetch('api/check', { method: 'POST', body: 'fixture' })).text()), 'POST');
    assert.equal(await first.evaluate(async () => (await fetch('api/check')).text()), 'GET');
    assert.equal(await first.evaluate(async () => (await fetch('/neighbor/check')).text()), 'GET');
    assert.equal(await first.evaluate(async (url) => (await fetch(url)).text(), origin.replace('127.0.0.1', 'localhost') + '/neighbor/check'), 'GET');
    assert.ok(requests.slice(count).some((entry) => entry.method === 'POST' && entry.path === '/portfolio/api/check'));
    assert.deepEqual(await cacheNames(first), before);
    assert.equal(await first.evaluate(async () => { const keys = await caches.keys(); for (const key of keys) { if ((await (await caches.open(key)).keys()).some((req) => /api\/check|neighbor\/check/.test(req.url))) return true; } return false; }), false);
    mounts.set('/portfolio/', fixture('/portfolio/', 1));
    const versions = await first.evaluate(async () => ({ pinned: (await (await fetch('assets/json/version.json')).json()).version, fresh: (await (await fetch('assets/json/version.json?release-check=1')).json()).version }));
    assert.equal(versions.pinned, old.release.version);
    assert.equal(versions.fresh, mounts.get('/portfolio/').release.version);
  });
  await check('real waiting version-only update, Later deferral, offline/update priority, one-tab reload and old draft/pin', async () => {
    await second.evaluate(() => { document.querySelector('[data-composer-disclosure]').open = true; document.querySelector('[name="message"]').value = 'Preserve this unsent draft'; document.activeElement.blur(); });
    await update(first);
    await first.waitForSelector('#pwa-banner[data-kind="update"]:not([hidden])');
    assert.equal(await first.locator('#welcome-panel').isVisible(), false);
    await first.locator('[data-banner-dismiss]').click();
    assert.equal(await first.locator('#pwa-banner').isVisible(), false);
    await lifecycle.setOffline(true);
    await first.waitForSelector('#pwa-banner[data-kind="status"]:not([hidden])');
    await first.locator('[data-banner-dismiss]').click();
    assert.equal(await first.locator('#pwa-banner').isVisible(), false);
    assert.equal(await first.locator('[data-pwa-install]').isVisible(), true);
    await lifecycle.setOffline(false);
    // Advance advisory UI clock, not worker/browser lifecycle, to verify the minute deferral.
    await first.evaluate(() => { const now = Date.now; Date.now = () => now() + 61000; document.dispatchEvent(new Event('visibilitychange')); });
    await first.waitForSelector('#pwa-banner[data-kind="update"]:not([hidden])');
    await lifecycle.setOffline(true);
    await first.waitForTimeout(100);
    assert.equal(await first.locator('#pwa-banner').getAttribute('data-kind'), 'update');
    await lifecycle.setOffline(false);
    await first.locator('[data-banner-action]').click();
    await first.waitForFunction((value) => document.querySelector('meta[name="portfolio-release"]')?.content === value, mounts.get('/portfolio/').release.version);
    assert.equal(await versionInPage(second), old.release.version);
    assert.equal(await second.locator('[name="message"]').inputValue(), 'Preserve this unsent draft');
    assert.equal(await pin(second, old.release.token), true);
    assert.equal(await second.evaluate(async () => (await (await fetch('assets/json/version.json')).json()).version), old.release.version);
    assert.equal(await second.evaluate(async () => (await (await fetch('assets/json/version.json?release-check=1')).json()).version), mounts.get('/portfolio/').release.version);
    assert.equal(releaseNames(await cacheNames(second), '/portfolio/').length, 2);
  });
  await check('draft changed during delayed activation: no automatic reload, explicit reload offered', async () => {
    mounts.set('/portfolio/', fixture('/portfolio/', 2, { delayedActivation: true }));
    await update(first);
    await first.waitForSelector('#pwa-banner[data-kind="update"]:not([hidden])');
    const original = await versionInPage(first);
    await first.locator('[data-banner-action]').click();
    await first.evaluate(() => { document.querySelector('[data-composer-disclosure]').open = true; document.querySelector('[name="message"]').value = 'New draft while activation is pending'; });
    await first.waitForSelector('#pwa-banner[data-kind="update"]:not([hidden])', { timeout: 15000 });
    assert.equal(await versionInPage(first), original);
    assert.equal(await first.locator('[name="message"]').inputValue(), 'New draft while activation is pending');
    await until(() => first.evaluate(async () => !(await navigator.serviceWorker.getRegistration())?.waiting), 'delayed activation finished');
  });
  await check('missing/modified/redirected mandatory resource: actual install rejection, no partial entries, old release intact', async () => {
    for (const fault of ['missing', 'modified', 'redirect']) {
      const candidate = fixture('/portfolio/', 3 + ['missing', 'modified', 'redirect'].indexOf(fault));
      candidate.fault = fault;
      mounts.set('/portfolio/', candidate);
      const outcome = await first.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        const failed = new Promise((resolve) => reg.addEventListener('updatefound', () => { const worker = reg.installing; worker.addEventListener('statechange', () => { if (worker.state === 'redundant') resolve(true); }); }, { once: true }));
        await reg.update();
        return Promise.race([failed, new Promise((resolve) => setTimeout(() => resolve(false), 12000))]);
      });
      assert.equal(outcome, true, fault);
      const partial = await first.evaluate(async (token) => { const name = (await caches.keys()).find((name) => name.endsWith(':release:' + token)); return name ? (await (await caches.open(name)).keys()).length : 0; }, candidate.release.token);
      assert.equal(partial, 0, fault);
      assert.equal(await second.evaluate(async () => (await (await fetch('assets/json/version.json')).json()).version), old.release.version);
    }
  });
  await check('natural activation after all deployment tabs close: scoped cleanup retains neighboring cache', async () => {
    const neighborName = 'another-app:/neighbor:release:keep';
    await first.evaluate((name) => caches.open(name), neighborName);
    mounts.set('/portfolio/', fixture('/portfolio/', 6));
    await update(first);
    const observer = await lifecycle.newPage();
    await observer.goto(origin + '/no-js/');
    await first.close();
    await second.close();
    await until(async () => { const names = await cacheNames(observer); return releaseNames(names, '/portfolio/').length === 1 && names.includes(neighborName); }, 'natural activation and scoped cache cleanup');
    await until(() => observer.evaluate(async (url) => { const reg = await navigator.serviceWorker.getRegistration(url); return reg?.active?.state === 'activated' && !reg.waiting && !reg.installing; }, origin + '/portfolio/'), 'natural worker activation completed');
    const names = await cacheNames(observer);
    console.log(JSON.stringify({ cleanupCaches: names, expectedToken: mounts.get('/portfolio/').release.token }));
    assert.equal(releaseNames(names, '/portfolio/').length, 1);
    assert.ok(names.includes(neighborName));
    assert.equal(names.includes(`aneesa-tariq-portfolio:${encodeURIComponent('/portfolio/')}:clients`), false);
  });
  await check('cache eviction: mandatory resource/home fail closed with 503, no network mixing', async () => {
    const page = await lifecycle.newPage();
    page.on('pageerror', (error) => console.error(`Eviction setup runtime error: ${error.message}`));
    await enhanced(page, '/portfolio/');
    await controlled(page);
    const name = releaseNames(await cacheNames(page), '/portfolio/')[0];
    await page.evaluate(async ({ name, base }) => { const cache = await caches.open(name); await cache.delete(base + 'assets/css/site.css'); }, { name, base: origin + '/portfolio/' });
    assert.equal(await page.evaluate(async () => (await fetch('assets/css/site.css')).status), 503);
    await page.evaluate(async ({ name, base }) => { const cache = await caches.open(name); await cache.delete(base + 'index.html'); }, { name, base: origin + '/portfolio/' });
    const response = await page.reload();
    assert.equal(response.status(), 503);
    await page.close();
  });
} finally {
  for (const ctx of contexts) await ctx.close().catch(() => {});
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  console.log(JSON.stringify({ acceptance: outcomes }, null, 2));
  if (outcomes.some((test) => test.result === 'FAIL')) process.exitCode = 1;
}
