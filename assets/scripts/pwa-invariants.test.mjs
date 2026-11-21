// Dependency-free structural/lifecycle checks. Real Cache API/SRI and UI need browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { createProjections, createReleaseToken } from './sync-content.mjs';

const root = new URL('../../', import.meta.url);
const workerSource = await readFile(new URL('sw.js', root), 'utf8');
const release = JSON.parse(workerSource.split('const RELEASE = ')[1].split(';\n// GENERATED:RELEASE:END')[0]);

function harness(path = '/portfolio/') {
  const base = new URL(path, 'https://example.test');
  const events = {};
  const stores = new Map();
  const calls = { skip: 0, claim: 0, network: [], batches: [] };
  let windows = [];
  let failure = false;
  let network = async () => new Response('Server missing', { status: 404 });
  const storage = {
    async keys() { return [...stores.keys()]; },
    async has(name) { return stores.has(name); },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      const key = (request) => typeof request === 'string' ? request : request.url;
      return {
        async match(request) { return entries.get(key(request))?.clone(); },
        async put(request, response) { entries.set(key(request), response.clone()); },
        async addAll(requests) {
          calls.batches.push(requests);
          if (failure) throw new Error('Mandatory resource unavailable');
          for (const request of requests) {
            const leaf = new URL(request.url).pathname;
            entries.set(request.url, new Response(leaf.endsWith('index.html') ? 'release homepage' : `<base href="https://production.test/"><p>${leaf}</p>`));
          }
        }
      };
    }
  };
  const context = {
    URL, Request, Response, caches: storage,
    fetch: async (request) => { calls.network.push(request); return network(request); },
    self: {
      location: { href: new URL('sw.js', base).href },
      registration: { waiting: null, installing: null },
      addEventListener(name, handler) { events[name] = handler; },
      async skipWaiting() { calls.skip += 1; },
      clients: {
        async matchAll() { return windows; },
        async claim() { calls.claim += 1; }
      }
    }
  };
  runInNewContext(workerSource + '\nglobalThis.names = { CACHE_NAME, RELEASE_PREFIX, CLIENT_CACHE };', context);
  async function dispatch(type, extra = {}) {
    const pending = [];
    let response;
    events[type]({
      ports: [], ...extra,
      waitUntil(work) { pending.push(work); },
      respondWith(work) { response = work; }
    });
    await Promise.all(pending);
    return response ? await response : undefined;
  }
  const request = (path, mode = 'navigate', method = 'GET') => {
    const result = new Request(new URL(path, base), { method });
    Object.defineProperty(result, 'mode', { value: mode });
    return result;
  };
  return {
    base, calls, storage, stores, names: context.names, dispatch, request,
    windows(value) { windows = value; },
    pendingWorker(state) { context.self.registration.waiting = state === 'waiting' ? {} : null; context.self.registration.installing = state === 'installing' ? {} : null; },
    failInstall(value) { failure = value; },
    network(value) { network = value; }
  };
}

test('projections are deterministic, synchronized, and include correct integrity/budget', async () => {
  const first = await createProjections();
  const second = await createProjections();
  assert.deepEqual([...first], [...second]);
  for (const [path, generated] of first) assert.equal(await readFile(new URL(path, root), 'utf8'), generated, path);
  assert.ok(release.precacheBytes <= release.budgetBytes && release.budgetBytes <= 2_000_000);
  assert.equal(release.resources.length, new Set(release.resources.map((item) => item.path)).size);
  let bytes = 0;
  for (const resource of release.resources) {
    assert.doesNotMatch(resource.path, /(?:inixio|scripts|resume|README|hero\.png|about\.png|sw\.js)/);
    const data = await readFile(new URL(resource.path, root));
    bytes += data.length;
    assert.equal(resource.bytes, data.length, resource.path);
    assert.equal(resource.integrity, `sha256-${createHash('sha256').update(data).digest('base64')}`, resource.path);
  }
  assert.equal(bytes, release.precacheBytes);
  const manifest = JSON.parse(first.get('manifest.json'));
  assert.equal(manifest.id, '.');
  assert.equal(manifest.start_url, '.');
  assert.equal(manifest.scope, '.');
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
});

test('version-only changes alter the actual token input without mutating files', async () => {
  const buffers = new Map();
  for (const { path } of release.resources) {
    let bytes = await readFile(new URL(path, root));
    if (path === 'index.html') bytes = Buffer.from(bytes.toString().replace(/(<meta name="portfolio-release-token" content=")[a-f0-9]+/, '$1'));
    buffers.set(path, bytes);
  }
  const original = createReleaseToken(workerSource, buffers);
  assert.equal(original, release.token);
  const version = JSON.parse(buffers.get('assets/json/version.json'));
  version.version += '-invariant';
  buffers.set('assets/json/version.json', Buffer.from(JSON.stringify(version)));
  assert.notEqual(createReleaseToken(workerSource, buffers), original);
});

test('installation uses one integrity-protected atomic batch and never skips waiting', async () => {
  const worker = harness();
  await worker.dispatch('install');
  assert.equal(worker.calls.batches.length, 1);
  assert.equal(worker.calls.batches[0].length, release.resources.length);
  for (const request of worker.calls.batches[0]) {
    assert.match(request.integrity, /^sha256-/);
    assert.equal(request.redirect, 'error');
    assert.equal(request.cache, 'reload');
  }
  assert.equal(worker.calls.skip, 0);
  const failed = harness();
  failed.failInstall(true);
  await assert.rejects(failed.dispatch('install'), /Mandatory resource/);
  assert.equal(failed.calls.skip, 0);
});

for (const base of ['/', '/portfolio/']) {
  test(`root/index/query navigation, real 404, and offline 503 at ${base}`, async () => {
    const worker = harness(base);
    await worker.dispatch('install');
    for (const path of ['./', './?from=test', 'index.html?from=test']) {
      const response = await worker.dispatch('fetch', { request: worker.request(path), resultingClientId: path });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'release homepage');
    }
    const missing = await worker.dispatch('fetch', { request: worker.request('not/a/page') });
    assert.equal(missing.status, 404);
    assert.ok((await missing.text()).includes(`<base href="${worker.base.href}">`));
    worker.network(async () => { throw new Error('Offline'); });
    const offline = await worker.dispatch('fetch', { request: worker.request('not/a/page') });
    assert.equal(offline.status, 503);
    assert.match(await offline.text(), /offline\.html/);
  });
}

test('out-of-scope, external, and non-GET requests are untouched; unknown APIs are not cached', async () => {
  const worker = harness();
  await worker.dispatch('install');
  for (const request of [worker.request('/outside'), worker.request('https://external.test/'), worker.request('api', 'cors', 'POST')]) {
    assert.equal(await worker.dispatch('fetch', { request }), undefined);
  }
  assert.equal(worker.calls.network.length, 0);
  const size = worker.stores.get(worker.names.CACHE_NAME).size;
  await worker.dispatch('fetch', { request: worker.request('api?query=1', 'cors') });
  assert.equal(worker.stores.get(worker.names.CACHE_NAME).size, size);
  const fresh = worker.request('assets/json/version.json?release-check=1', 'cors');
  await worker.dispatch('fetch', { request: fresh });
  assert.equal(worker.calls.network.at(-1).cache, 'no-store');
});

test('old tabs pin their release; cleanup retains live releases and never touches neighbors', async () => {
  const worker = harness();
  await worker.dispatch('install');
  const token = 'a'.repeat(64);
  const oldName = worker.names.RELEASE_PREFIX + token;
  const old = await worker.storage.open(oldName);
  await old.put(new URL('assets/css/site.css', worker.base).href, new Response('old CSS'));
  const neighbor = 'another-app:/elsewhere:release:untouched';
  await worker.storage.open(neighbor);
  const source = { id: 'old-tab', url: worker.base.href };
  worker.windows([source]);
  await worker.dispatch('message', { source, data: { type: 'PIN_RELEASE', token } });
  const response = await worker.dispatch('fetch', { request: worker.request('assets/css/site.css', 'cors'), clientId: source.id });
  assert.equal(await response.text(), 'old CSS');
  await worker.dispatch('activate');
  assert.ok(await worker.storage.has(oldName));
  assert.equal(worker.calls.claim, 0);
  await worker.dispatch('message', { source, data: { type: 'ACTIVATE_UPDATE' } });
  assert.equal(worker.calls.skip, 1);
  worker.windows([]);
  await worker.dispatch('activate');
  assert.equal(await worker.storage.has(oldName), false);
  assert.ok(await worker.storage.has(worker.names.CACHE_NAME));
  assert.ok(await worker.storage.has(neighbor));
});

for (const state of ['waiting', 'installing']) {
  test(`delayed activation never deletes a newer ${state} worker's cache`, async () => {
    const worker = harness();
    await worker.dispatch('install');
    const futureName = worker.names.RELEASE_PREFIX + 'b'.repeat(64);
    const future = await worker.storage.open(futureName);
    await future.put(new URL('index.html', worker.base).href, new Response('future release'));
    worker.windows([]);
    worker.pendingWorker(state);
    await worker.dispatch('activate');
    assert.ok(await worker.storage.has(futureName));
    assert.equal(await (await future.match(new URL('index.html', worker.base).href)).text(), 'future release');
    worker.pendingWorker(null);
    await worker.dispatch('activate');
    assert.equal(await worker.storage.has(futureName), false);
    assert.ok(await worker.storage.has(worker.names.CACHE_NAME));
  });
}
