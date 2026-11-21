const releaseVersion = new URL(import.meta.url).searchParams.get('v') ||
  document.querySelector('meta[name="portfolio-release"]')?.content || '';
const importVersioned = (path) => {
  const url = new URL(path, import.meta.url);
  if (releaseVersion) url.searchParams.set('v', releaseVersion);
  return import(url.href);
};
const PWA_MODULE_ENABLED = true;
let earlyInstallPrompt;
const captureInstallPrompt = (event) => { event.preventDefault(); earlyInstallPrompt = event; };
if (PWA_MODULE_ENABLED) window.addEventListener('beforeinstallprompt', captureInstallPrompt);
let initialized = false;

async function initialize() {
  if (initialized) return;
  initialized = true;
  const [dataResult, uiResult] = await Promise.allSettled([
    importVersioned('./data.js'),
    importVersioned('./ui.js')
  ]);
  if (uiResult.status !== 'fulfilled') {
    document.documentElement.dataset.uiReady = 'unavailable';
    window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
    return;
  }
  const baseURL = dataResult.status === 'fulfilled' ? dataResult.value.baseURL : new URL('../../', import.meta.url);
  let context = { content: null, settings: null, version: null, baseURL };
  if (dataResult.status === 'fulfilled') {
    try {
      context = await dataResult.value.loadSiteData();
      document.documentElement.dataset.dataStatus = 'ready';
    } catch {
      // The generated HTML remains usable when optional configuration is unavailable.
      document.documentElement.dataset.dataStatus = 'static-fallback';
    }
  } else {
    document.documentElement.dataset.dataStatus = 'static-fallback';
  }
  const ui = uiResult.value.initUI(context);
  document.documentElement.dataset.uiReady = 'true';
  if (PWA_MODULE_ENABLED && context.settings?.features?.pwa && context.settings?.pwa?.enabled) {
    try {
      const { initPWA } = await importVersioned('./pwa.js');
      const pwa = await initPWA(context, ui);
      if (earlyInstallPrompt) pwa?.offerInstall(earlyInstallPrompt);
    } catch {
      // Offline/install support is optional and must never disable the page.
      document.documentElement.dataset.pwaStatus = 'unavailable';
    }
  }
  window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
  earlyInstallPrompt = null;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
