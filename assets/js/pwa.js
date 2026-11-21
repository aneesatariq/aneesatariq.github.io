// Progressive enhancement: install + update only. No release pinning or SRI offline cache.
let initialized = false;

export async function initPWA(context, ui) {
  if (initialized || !context.settings?.features?.pwa || !context.settings?.pwa?.enabled) return;
  initialized = true;
  const { content, settings, version, baseURL } = context;
  const options = settings.pwa;
  const copy = content.ui.pwa;
  const installButton = ui.elements.installButton;
  const displayMode = matchMedia('(display-mode: standalone)');
  const capable = window.isSecureContext && 'serviceWorker' in navigator;
  let registration;
  let deferredPrompt;
  const usedPrompts = new WeakSet();
  let installed = displayMode.matches || navigator.standalone === true;
  let updateDeferredUntil = 0;
  let notice = '';
  let acceptedUpdate = false;
  let acceptedDraft = '';
  let reloaded = false;
  let activationTimer;
  let controllerChanged = false;
  let checking = false;
  let lastCheck = 0;

  const draft = () => Array.from(document.querySelectorAll('#contact-composer input, #contact-composer textarea')).map((field) => field.value).join('\n');
  const editing = () => document.activeElement?.matches('input, textarea, [contenteditable="true"]');
  const hideNotice = (kind) => { ui.banners.hide(kind); notice = ''; };

  function reloadOnce() {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  }

  function renderNotice() {
    if (acceptedUpdate || ui.dialog.isOpen() || editing()) return;
    const waitingUpdate = registration?.waiting?.state === 'installed' &&
      registration.active && registration.active !== registration.waiting && hadController;
    const updateReady = options.update.enabled && (waitingUpdate || controllerChanged);
    if (updateReady && Date.now() >= updateDeferredUntil) {
      if (notice === 'update') return;
      if (ui.banners.show('update', {
        title: copy.updateTitle,
        description: copy.updateDescription,
        actionLabel: copy.updateAction,
        dismissLabel: copy.updateDismiss,
        onAction: acceptUpdate,
        onDismiss() { notice = ''; updateDeferredUntil = Date.now() + 60_000; renderNotice(); }
      })) notice = 'update';
    }
  }

  function acceptUpdate() {
    if (!registration?.waiting) {
      if (controllerChanged) reloadOnce();
      return;
    }
    acceptedUpdate = true;
    acceptedDraft = draft();
    hideNotice('update');
    activationTimer = setTimeout(() => {
      acceptedUpdate = false;
      ui.announce(copy.updateError);
      renderNotice();
    }, 15_000);
    try {
      registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
    } catch {
      clearTimeout(activationTimer);
      acceptedUpdate = false;
      ui.announce(copy.updateError);
      renderNotice();
    }
  }

  function syncInstallButton() {
    if (!installButton) return;
    installButton.hidden = !options.install.enabled || installed;
    const label = deferredPrompt ? copy.installAction : copy.installHelpLabel;
    if (installButton.firstChild?.nodeType === Node.TEXT_NODE) installButton.firstChild.textContent = label;
    else installButton.prepend(document.createTextNode(label));
    installButton.setAttribute('aria-haspopup', deferredPrompt ? 'false' : 'dialog');
  }

  const helpHost = document.createElement('div');
  helpHost.className = 'container';
  helpHost.hidden = true;
  const helpContent = document.createElement('div');
  helpHost.append(helpContent);
  document.body.append(helpHost);

  function installHelp() {
    const paragraphs = [
      !capable ? copy.secureContextHelp : copy.installHelp,
      copy.iosHelp,
      copy.desktopHelp,
      copy.bookmarkHelp
    ];
    helpContent.replaceChildren(...paragraphs.map((text) => {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      return paragraph;
    }));
    const opened = ui.dialog.open({
      title: copy.installHelpLabel,
      description: copy.installDescription,
      eyebrow: content.profile.name,
      content: helpContent,
      trigger: installButton
    });
    if (!opened) {
      helpHost.hidden = false;
      helpContent.tabIndex = -1;
      helpContent.focus();
      ui.announce(paragraphs.join(' '));
    }
  }

  async function requestInstall() {
    if (!deferredPrompt) { installHelp(); return; }
    const prompt = deferredPrompt;
    usedPrompts.add(prompt);
    deferredPrompt = null;
    syncInstallButton();
    if (installButton) installButton.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted' && !installed) {
        ui.announce(copy.installAcceptedMessage);
      }
    } catch {
      ui.announce(copy.installUnavailable);
    } finally {
      if (installButton) installButton.disabled = false;
      syncInstallButton();
    }
  }

  installButton?.addEventListener('click', requestInstall);
  function offerInstall(event) {
    if (!capable || !options.install.enabled || installed || usedPrompts.has(event)) return;
    event.preventDefault();
    deferredPrompt = event;
    syncInstallButton();
  }
  window.addEventListener('beforeinstallprompt', offerInstall);
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    ui.banners.hide('install');
    syncInstallButton();
    ui.announce(copy.installedMessage);
  });
  displayMode.addEventListener('change', () => {
    installed = displayMode.matches || navigator.standalone === true;
    syncInstallButton();
  });
  syncInstallButton();

  window.addEventListener('online', () => {
    ui.announce(copy.onlineMessage);
    checkRelease();
  });
  document.addEventListener('focusout', () => setTimeout(renderNotice, 0));
  ui.dialog.element?.addEventListener('close', renderNotice);
  ui.dialog.secondaryElement?.addEventListener('close', renderNotice);
  renderNotice();
  if (!capable) {
    document.documentElement.dataset.pwaStatus = 'unsupported';
    return { offerInstall };
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    controllerChanged = Boolean(hadController) || acceptedUpdate;
    hadController = true;
    clearTimeout(activationTimer);
    if (acceptedUpdate && options.update.reloadAfterActivation && draft() === acceptedDraft) {
      acceptedUpdate = false;
      reloadOnce();
      return;
    }
    acceptedUpdate = false;
    notice = '';
    renderNotice();
  });
  let hadController = Boolean(navigator.serviceWorker.controller);

  function watchWorker(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && registration?.waiting) {
        updateDeferredUntil = 0;
        renderNotice();
      }
    });
  }

  async function checkRelease() {
    if (!registration || !options.update.enabled || !navigator.onLine || checking || Date.now() - lastCheck < 60_000) return;
    checking = true;
    lastCheck = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const freshURL = new URL('assets/json/version.json', baseURL);
      freshURL.searchParams.set('release-check', '1');
      const response = await fetch(freshURL, {
        cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal
      });
      if (response.ok && response.type !== 'opaque') {
        const fresh = await response.json();
        if (typeof fresh.version === 'string' && fresh.version !== version.version) {
          document.documentElement.dataset.releaseAvailable = 'true';
        }
      }
    } catch {
      // Advisory only.
    } finally {
      clearTimeout(timeout);
      controller.abort();
      try { await registration.update(); } catch { /* keep current worker */ }
      checking = false;
      renderNotice();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    renderNotice();
    checkRelease();
  });
  try {
    const workerURL = new URL('sw.js', baseURL);
    workerURL.searchParams.set('v', version.version);
    registration = await navigator.serviceWorker.register(workerURL, {
      scope: baseURL.href, updateViaCache: 'none'
    });
    document.documentElement.dataset.pwaStatus = 'registered';
    registration.addEventListener('updatefound', () => watchWorker(registration.installing));
    watchWorker(registration.installing);
    renderNotice();
    checkRelease();
  } catch {
    document.documentElement.dataset.pwaStatus = 'unavailable';
  }
  return { offerInstall };
}
