#!/usr/bin/env node
// Maintenance generation only. Hosting consumes the committed static projections directly.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { renderSite, renderFallback, escapeHTML, localURL } from './render-site.mjs';

const rootURL = new URL('../../', import.meta.url);
const markers = (name) => ({ start: `<!-- GENERATED:${name}:START -->`, end: `<!-- GENERATED:${name}:END -->` });
const skeleton = `<!doctype html>
<html lang="en">
<head>
<!-- GENERATED:HEAD:START -->
<!-- GENERATED:HEAD:END -->
</head>
<body>
<!-- GENERATED:PAGE:START -->
<!-- GENERATED:PAGE:END -->
<script type="module" src="./assets/js/app.js"></script>
</body>
</html>
`;

function replaceRegion(html, name, value) {
  const { start, end } = markers(name);
  const startIndex = html.indexOf(start);
  const endIndex = html.indexOf(end);
  if (startIndex === -1 || endIndex <= startIndex || html.indexOf(start, startIndex + start.length) !== -1 || html.indexOf(end, endIndex + end.length) !== -1) {
    throw new Error(`Missing, duplicated, or misordered ${name} generation markers.`);
  }
  return html.slice(0, startIndex + start.length) + '\n' + value + '\n' + html.slice(endIndex);
}

const readJSON = async (path) => JSON.parse((await readFile(new URL(path, rootURL), 'utf8')).replace(/^\uFEFF/, ''));
const normalizeText = (value) => value.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
const digest = (value, encoding = 'hex') => createHash('sha256').update(value).digest(encoding);
const releaseStart = '// GENERATED:RELEASE:START';
const releaseEnd = '// GENERATED:RELEASE:END';

function workerSource(source, replacement = '') {
  const start = source.indexOf(releaseStart);
  const end = source.indexOf(releaseEnd);
  if (start < 0 || end <= start || source.indexOf(releaseStart, start + releaseStart.length) !== -1 || source.indexOf(releaseEnd, end + releaseEnd.length) !== -1) {
    throw new Error('Worker release markers are missing, duplicated, or misordered.');
  }
  return source.slice(0, start + releaseStart.length) + '\n' + replacement + source.slice(end);
}

export function createReleaseToken(worker, buffers) {
  const hash = createHash('sha256').update(workerSource(normalizeText(worker)));
  for (const [path, bytes] of [...buffers].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    hash.update(path + '\0').update(digest(bytes) + '\n');
  }
  return hash.digest('hex');
}

function validatePWA(settings, version) {
  const pwa = settings.pwa;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version.version)) throw new Error('version must use semantic versioning.');
  if (!/^[a-z0-9-]+$/.test(pwa.cacheNamespace)) throw new Error('Invalid PWA cache namespace.');
  if (![pwa.id, pwa.startURL, pwa.scope].every((value) => value === '.' || value === './')) throw new Error('Manifest id, startURL, and scope must remain deployment-relative.');
  if (!pwa.scopeCacheByDeployment || !pwa.update.requireConfirmation || pwa.install.autoPrompt || !pwa.install.requireSupportedBrowser || pwa.offline.cacheOriginalImages) {
    throw new Error('Keep scope isolation, explicit updates, supported installation, and bounded optimized media safety settings.');
  }
  if (settings.features.telemetry || pwa.telemetry) throw new Error('Telemetry is not implemented or approved.');
  for (const color of [pwa.themeColor, pwa.backgroundColor]) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('PWA colors must be six-digit hexadecimal colors.');
  }
  if (!Number.isSafeInteger(pwa.offline.maxPrecacheBytes) || pwa.offline.maxPrecacheBytes < 1 || pwa.offline.maxPrecacheBytes > 2_000_000) {
    throw new Error('The complete offline release must fit a positive budget no greater than 2,000,000 bytes.');
  }
}

export async function createProjections() {
  const [content, settings, version, currentHTML] = await Promise.all([
    readJSON('assets/json/content.json'),
    readJSON('assets/json/settings.json'),
    readJSON('assets/json/version.json'),
    readFile(new URL('index.html', rootURL), 'utf8')
  ]);
  validatePWA(settings, version);
  const { head, page, language, url } = renderSite(content, settings, version);
  if (!/^[a-z]{2,3}(?:-[a-zA-Z]{2,8})*$/.test(language)) throw new Error('Invalid document language.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(version.releaseDate)) throw new Error('releaseDate must be YYYY-MM-DD.');
  let html = currentHTML.includes('<!-- GENERATED:') ? currentHTML.replace(/\r\n/g, '\n') : skeleton;
  html = html.replace(/<html\s+lang="[^"]*">/, `<html lang="${escapeHTML(language)}">`);
  html = replaceRegion(replaceRegion(html, 'HEAD', head), 'PAGE', page);
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', url).href}\n`;
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeHTML(url.href)}</loc>
    <lastmod>${escapeHTML(version.releaseDate)}</lastmod>
  </url>
</urlset>
`;
  const pwa = settings.pwa;
  const icon = (asset) => ({ src: localURL(asset.src), sizes: asset.sizes, type: asset.type, purpose: asset.purpose || 'any' });
  const manifest = {
    id: pwa.id, name: pwa.name, short_name: pwa.shortName, description: pwa.description,
    lang: pwa.lang, dir: 'ltr', start_url: pwa.startURL, scope: pwa.scope,
    display: pwa.display, orientation: pwa.orientation,
    theme_color: pwa.themeColor, background_color: pwa.backgroundColor,
    icons: ['icon192', 'icon512', 'maskable512'].map((key) => icon(settings.assets.icons[key]))
  };
  const projections = new Map([
    ['index.html', html], ['robots.txt', robots], ['sitemap.xml', sitemap],
    ['manifest.json', JSON.stringify(manifest, null, 2) + '\n'],
    ['offline.html', renderFallback(content, settings, 'offline')],
    ['404.html', renderFallback(content, settings, 'notFound')]
  ]);
  // Explicit infrastructure plus JSON-derived portrait candidates and icons.
  // All twelve portrait candidates are mandatory, regardless of viewport/format.
  const paths = new Set([
    'index.html', 'offline.html', '404.html', 'manifest.json', 'assets/css/site.css',
    'assets/js/app.js', 'assets/js/data.js', 'assets/js/ui.js', 'assets/js/pwa.js',
    'assets/json/content.json', 'assets/json/settings.json', 'assets/json/version.json'
  ]);
  const addAsset = (src) => paths.add(localURL(src).slice(2));
  Object.values(settings.assets.icons).forEach((asset) => addAsset(asset.src));
  for (const name of ['hero', 'about']) {
    const asset = settings.assets.images[name];
    for (const source of [asset, ...Object.values(asset.sources).flat()]) {
      if (!/^assets\/image\/covers\/(?:hero|about)-(?:480|800|1200)\.(?:jpg|webp)$/.test(source.src)) {
        throw new Error('Offline portraits must be approved optimized derivatives, never originals.');
      }
      addAsset(source.src);
    }
  }
  const buffers = new Map();
  for (const path of [...paths].sort()) {
    if (/\.(?:html|css|js|json|svg)$/.test(path)) {
      const text = normalizeText(projections.get(path) ?? await readFile(new URL(path, rootURL), 'utf8'));
      // Line-ending normalization is the only transformation of authored runtime sources.
      projections.set(path, text);
      buffers.set(path, Buffer.from(text));
    } else {
      buffers.set(path, await readFile(new URL(path, rootURL)));
    }
  }
  const currentWorker = normalizeText(await readFile(new URL('sw.js', rootURL), 'utf8'));
  // Hash worker logic and normalized release bytes BEFORE inserting the HTML token.
  // No clock/randomness, no worker self-hash, and no circular HTML/worker digest.
  const token = createReleaseToken(currentWorker, buffers);
  const tokenMeta = '<meta name="portfolio-release-token" content="">';
  if (!projections.get('index.html').includes(tokenMeta)) throw new Error('Missing homepage release-token projection.');
  html = projections.get('index.html').replace(tokenMeta, `<meta name="portfolio-release-token" content="${token}">`);
  projections.set('index.html', html);
  buffers.set('index.html', Buffer.from(html));
  const resources = [...buffers].map(([path, bytes]) => ({ path, integrity: `sha256-${digest(bytes, 'base64')}`, bytes: bytes.length }));
  const precacheBytes = resources.reduce((sum, resource) => sum + resource.bytes, 0);
  if (precacheBytes > pwa.offline.maxPrecacheBytes) throw new Error(`Precache ${precacheBytes} bytes exceeds the ${pwa.offline.maxPrecacheBytes}-byte budget.`);
  const release = {
    version: version.version, token, namespace: pwa.cacheNamespace,
    enabled: settings.features.pwa && pwa.enabled, offlineEnabled: pwa.offline.enabled,
    precacheBytes, budgetBytes: pwa.offline.maxPrecacheBytes, resources
  };
  projections.set('sw.js', workerSource(currentWorker, `const RELEASE = ${JSON.stringify(release, null, 2)};\n`));
  return projections;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node assets/scripts/sync-content.mjs [--check | --help]\n\nNo flags: synchronize HTML, fallback pages, manifest, worker release hashes/list, SEO, and LF runtime text.\n--check: report stale projections without writing; exit 1 for drift.\n--help: show this help.\n\nJSON is the editorial source. Never hand-edit GENERATED regions.\nThe productionURL includes the deployment subpath, if any. robots.txt is honored only at an origin root.\nThis command is maintenance generation, not a serving or deployment build step.');
    return;
  }
  if (args.some((arg) => arg !== '--check')) throw new Error('Unknown argument. Use --help.');
  const projections = await createProjections();
  const drift = [];
  for (const [path, generated] of projections) {
    const file = new URL(path, rootURL);
    let current;
    try { current = await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (current !== generated) {
      drift.push(path);
      if (!args.includes('--check')) await writeFile(file, generated, 'utf8');
    }
  }
  if (args.includes('--check')) {
    console.log(drift.length ? `Static content drift:\n${drift.map((path) => `  ${path}`).join('\n')}` : 'Static projections are synchronized.');
    if (drift.length) process.exitCode = 1;
  } else {
    console.log(drift.length ? `Generated:\n${drift.map((path) => `  ${path}`).join('\n')}` : 'No projection changes.');
    const release = JSON.parse(projections.get('sw.js').split('const RELEASE = ')[1].split(';\n' + releaseEnd)[0]);
    console.log(`Precache: ${release.resources.length} resources, ${release.precacheBytes.toLocaleString('en-US')} / ${release.budgetBytes.toLocaleString('en-US')} bytes.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`Content synchronization failed: ${error.message}`); process.exitCode = 1; });
}
