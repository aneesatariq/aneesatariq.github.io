import { loadSiteData, baseURL } from './data.js';
import { initUI } from './ui.js';

// Optional PWA enhancement preserves the static site if registration is unavailable.
// pwa.js exports async function initPWA(context, ui). No PWA module is requested while disabled.
const PWA_MODULE_ENABLED = true;
// Retain a prompt that arrives while configuration/modules are still loading.
let earlyInstallPrompt;
const captureInstallPrompt = (event) => { event.preventDefault(); earlyInstallPrompt = event; };
if (PWA_MODULE_ENABLED) window.addEventListener('beforeinstallprompt', captureInstallPrompt);
let initialized = false;

async function initialize() {
  if (initialized) return;
  initialized = true;
  let context = { content: null, settings: null, version: null, baseURL };
  try {
    context = await loadSiteData();
    document.documentElement.dataset.dataStatus = 'ready';
  } catch {
    // The static snapshot remains authoritative, including working anchors and details.
    document.documentElement.dataset.dataStatus = 'static-fallback';
  }
  const ui = initUI(context);
  document.documentElement.dataset.uiReady = 'true';
  if (PWA_MODULE_ENABLED && context.settings?.features?.pwa && context.settings?.pwa?.enabled) {
    try {
      const { initPWA } = await import('./pwa.js');
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
