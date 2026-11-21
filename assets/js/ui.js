const welcomedScopes = new Set();
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// Enhances the generated DOM; it never replaces or re-renders editorial sections.
export function initUI(context) {
  const { content, settings, baseURL } = context;
  const features = settings?.features || {};
  const enabled = (name) => features[name] !== false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const announcer = $('#site-announcer');
  let announcementTimer;
  function announce(message) {
    if (!announcer || !message) return;
    clearTimeout(announcementTimer);
    announcer.textContent = '';
    announcementTimer = setTimeout(() => { announcer.textContent = String(message); }, 50);
  }

  const welcome = $('#welcome-panel');
  const noticeStack = $('#notice-stack');
  const banner = $('#pwa-banner');
  const storageScope = `${settings?.welcomePopup?.storageKey || 'aneesa-tariq:welcome:v1'}:${baseURL.origin}${baseURL.pathname}`;
  let welcomeTimer;
  let welcomeDismissed = false;
  const hadWelcome = () => {
    if (welcomedScopes.has(storageScope)) return true;
    for (const storageName of ['localStorage', 'sessionStorage']) {
      try { if (window[storageName].getItem(storageScope) === 'seen') return true; } catch { /* Storage can be denied without disabling the page. */ }
    }
    return false;
  };
  function rememberWelcome() {
    welcomedScopes.add(storageScope);
    for (const storageName of ['localStorage', 'sessionStorage']) {
      try { window[storageName].setItem(storageScope, 'seen'); return; } catch { /* Fall back to a tab-scoped record, then in-memory state. */ }
    }
  }
  function dismissWelcome({ remember = true, restoreFocus = false } = {}) {
    clearTimeout(welcomeTimer);
    welcomeDismissed = true;
    if (remember) rememberWelcome();
    if (welcome) {
      const hadFocus = welcome.contains(document.activeElement);
      welcome.hidden = true;
      if (restoreFocus && hadFocus) $('a[href="#services"]')?.focus({ preventScroll: true });
    }
  }

  // Frozen integration surface: banners.show(kind, options), banners.hide(kind), banners.isVisible().
  // options: title, description, actionLabel, dismissLabel, onAction (may be async), onDismiss.
  let bannerState = null;
  const bannerAction = $('[data-banner-action]');
  const bannerDismiss = $('[data-banner-dismiss]');
  const banners = {
    show(kind, options = {}) {
      if (!banner || !['install', 'update', 'status'].includes(kind)) return false;
      if (bannerState?.kind === 'update' && kind !== 'update') return false;
      if (welcome?.contains(document.activeElement)) return false;
      dismissWelcome({ remember: false });
      bannerState = { kind, ...options };
      $('#pwa-banner-title').textContent = String(options.title || 'Portfolio');
      $('#pwa-banner-description').textContent = String(options.description || '');
      bannerAction.textContent = String(options.actionLabel || '');
      bannerAction.hidden = typeof options.onAction !== 'function' || !options.actionLabel;
      bannerAction.disabled = false;
      bannerDismiss.textContent = String(options.dismissLabel || 'Not now');
      banner.dataset.kind = kind;
      banner.hidden = false;
      announce([options.title, options.description].filter(Boolean).join('. '));
      return true;
    },
    hide(kind) {
      if (!bannerState || (kind && bannerState.kind !== kind)) return false;
      const focused = banner.contains(document.activeElement);
      banner.hidden = true;
      bannerState = null;
      if (focused) {
        const install = $('[data-pwa-install]');
        const target = install && !install.hidden ? install : $('.back-top');
        target?.focus({ preventScroll: true });
      }
      return true;
    },
    isVisible() { return Boolean(bannerState && !banner?.hidden && !noticeStack?.hidden); }
  };
  bannerAction?.addEventListener('click', async () => {
    const active = bannerState;
    if (!active?.onAction) return;
    bannerAction.disabled = true;
    try { await active.onAction(); } catch {
      announce(content?.ui?.pwa?.updateError || 'This action is not available right now. Please try again.');
    } finally { if (bannerState === active) bannerAction.disabled = false; }
  });
  bannerDismiss?.addEventListener('click', () => {
    const active = bannerState;
    banners.hide(active?.kind);
    try { active?.onDismiss?.(); } catch { /* An optional integration must not interrupt UI controls. */ }
  });

  // One native dialog owns modality, focus containment, Escape, and content restoration.
  const dialogElement = $('#scope-dialog');
  const dialogMount = $('#dialog-content');
  let dialogState = null;
  function restoreDialog() {
    if (!dialogState) return;
    const { placeholder, node, trigger, headings } = dialogState;
    headings.forEach(([heading, level]) => { if (level === null) heading.removeAttribute('aria-level'); else heading.setAttribute('aria-level', level); });
    placeholder.replaceWith(node);
    dialogState = null;
    document.body.classList.remove('dialog-open');
    if (noticeStack) noticeStack.hidden = false;
    if (trigger?.isConnected && !trigger.closest('[hidden]')) trigger.focus({ preventScroll: true });
  }
  const dialog = {
    // content must be an existing HTMLElement. It is moved, not duplicated, and restored on close.
    open({ title, description = '', eyebrow = '', content: node, trigger = document.activeElement } = {}) {
      if (!dialogElement?.showModal || dialogElement.open || !(node instanceof HTMLElement) || !node.parentNode) return false;
      const placeholder = document.createComment('Dialog content returns here on close.');
      node.before(placeholder);
      const headings = $$('.detail-group h4', node).map((heading) => [heading, heading.getAttribute('aria-level')]);
      headings.forEach(([heading]) => heading.setAttribute('aria-level', '3'));
      dialogState = { placeholder, node, trigger, headings };
      $('#dialog-title').textContent = String(title || 'Details');
      $('#dialog-description').textContent = String(description);
      $('#dialog-eyebrow').textContent = String(eyebrow);
      dialogMount.replaceChildren(node);
      try {
        dismissWelcome({ remember: false });
        if (noticeStack) noticeStack.hidden = true;
        dialogElement.showModal();
        document.body.classList.add('dialog-open');
        dialogElement.scrollTop = 0;
        $('#dialog-title').focus({ preventScroll: true });
        return true;
      } catch {
        restoreDialog();
        return false;
      }
    },
    close() { if (dialogElement?.open) dialogElement.close(); },
    isOpen() { return Boolean(dialogElement?.open); },
    element: dialogElement
  };
  dialogElement?.addEventListener('close', restoreDialog);
  dialogElement?.addEventListener('cancel', (event) => { event.preventDefault(); dialog.close(); });
  $('[data-dialog-close]')?.addEventListener('click', () => dialog.close());
  dialogElement?.addEventListener('click', (event) => {
    if (event.target !== dialogElement) return;
    const bounds = dialogElement.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialogElement?.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = $$('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]', dialogElement).filter((node) => node.getClientRects().length);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === $('#dialog-title'))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === $('#dialog-title'))) {
      event.preventDefault(); first.focus();
    }
  });
  if (enabled('detailDialogs') && typeof dialogElement?.showModal === 'function') {
    $$('[data-open-scope]').forEach((button) => {
      const source = document.getElementById(button.dataset.openScope);
      const card = button.closest('[data-scope-card]');
      if (!source || !card) return;
      button.addEventListener('click', () => {
        const opened = dialog.open({
          title: $('[data-scope-title]', card)?.textContent,
          description: $('[data-scope-description]', card)?.textContent,
          eyebrow: card.dataset.kind === 'representative' ? content?.ui?.representativeBadge || 'Representative scope' : content?.services?.eyebrow || 'How I can support you',
          content: $('.scope-detail-content', source),
          trigger: button
        });
        if (!opened) {
          source.hidden = false;
          source.open = true;
          button.hidden = true;
          $('summary', source)?.focus();
        }
      });
      source.hidden = true;
      button.hidden = false;
    });
  }

  const header = $('#site-header');
  const nav = $('#primary-nav');
  const menuButton = $('.menu-toggle');
  const compactNav = matchMedia('(max-width: 899px)');
  function setMenu(open, returnFocus = false) {
    if (!menuButton || !nav) return;
    const expanded = compactNav.matches && open;
    menuButton.setAttribute('aria-expanded', String(expanded));
    const menuLabel = expanded ? menuButton.dataset.closeLabel : menuButton.dataset.openLabel;
    menuButton.setAttribute('aria-label', menuLabel);
    $('.sr-only', menuButton).textContent = menuLabel;
    nav.hidden = compactNav.matches && !expanded;
    if (returnFocus) menuButton.focus({ preventScroll: true });
  }
  if (header && nav && menuButton) {
    menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
    const syncNav = () => {
      const focusWasInNav = nav.contains(document.activeElement);
      const focusWasOnToggle = document.activeElement === menuButton;
      menuButton.hidden = !compactNav.matches;
      setMenu(false, compactNav.matches && focusWasInNav);
      if (!compactNav.matches && focusWasOnToggle) $('a[aria-current], a', nav)?.focus({ preventScroll: true });
    };
    compactNav.addEventListener('change', syncNav);
    header.dataset.navReady = 'true';
    syncNav();
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') { setMenu(false, true); event.preventDefault(); }
    });
    document.addEventListener('click', (event) => {
      if (!header.contains(event.target) && menuButton.getAttribute('aria-expanded') === 'true') setMenu(false);
    });
    header.addEventListener('focusout', () => {
      setTimeout(() => { if (!header.contains(document.activeElement) && menuButton.getAttribute('aria-expanded') === 'true') setMenu(false); }, 0);
    });
    const links = $$('a[href^="#"]', nav);
    const sections = links.map((link) => document.getElementById(link.hash.slice(1))).filter(Boolean);
    let scrollFrame = 0;
    const updateActiveSection = () => {
      scrollFrame = 0;
      const offset = header.getBoundingClientRect().height + 100;
      let active = sections[0];
      for (const section of sections) { if (section.getBoundingClientRect().top <= offset) active = section; }
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 5) active = sections.at(-1);
      for (const link of links) {
        if (link.hash === `#${active?.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    };
    const measureHeader = () => {
      document.documentElement.style.setProperty('--header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
      updateActiveSection();
    };
    if ('ResizeObserver' in window) new ResizeObserver(measureHeader).observe(header);
    window.addEventListener('resize', measureHeader, { passive: true });
    window.addEventListener('scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateActiveSection); }, { passive: true });
    measureHeader();
  }
  // Native hash navigation is retained; focus follows the destination rather than a hidden menu link.
  $$('a[href^="#"]').forEach((link) => link.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = document.getElementById(link.hash.slice(1));
    if (!target) return;
    if (nav?.contains(link)) setMenu(false);
    if (target.matches('[tabindex="-1"]')) target.focus({ preventScroll: true });
    if (link.hasAttribute('data-welcome-action')) dismissWelcome();
  }));
  if (!enabled('backToTop')) $$('[data-back-top]').forEach((link) => { link.hidden = true; });

  $$('[data-filter-group]').forEach((group) => {
    if (!enabled(group.dataset.filterGroup === 'portfolio' ? 'portfolioFilters' : 'toolFilters')) return;
    const controls = $('[data-filter-controls]', group);
    if (!controls) return;
    const buttons = $$('[data-filter]', controls);
    const items = $$('[data-filter-item]', group);
    const count = $('[data-result-count]', controls);
    const empty = $('[data-filter-empty]', group);
    if (!items.length || !count) return;
    for (const button of buttons) {
      button.addEventListener('click', () => {
        const category = button.dataset.filter;
        let shown = 0;
        for (const item of items) {
          const matches = category === 'all' || item.dataset.categories.split(' ').includes(category);
          item.hidden = !matches;
          if (matches) shown += 1;
        }
        buttons.forEach((entry) => entry.setAttribute('aria-pressed', String(entry === button)));
        count.textContent = count.dataset.template.replace('{count}', shown).replace('{noun}', count.dataset.noun);
        if (empty) empty.hidden = shown > 0;
      });
    }
    controls.hidden = false;
  });

  const emailLink = $('.contact-email');
  const email = $('[data-email-address]')?.textContent.trim();
  const copyButton = $('[data-copy-email]');
  if (enabled('copyEmail') && copyButton && email) {
    copyButton.addEventListener('click', async () => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable.');
        await navigator.clipboard.writeText(email);
        announce(content?.contact?.emailCopied || 'Email address copied.');
      } catch {
        const fallback = $('[data-email-fallback]');
        if (fallback) {
          fallback.hidden = false;
          const input = $('input', fallback);
          input.focus();
          input.select();
          announce(content?.contact?.emailCopyFallback || "Copy isn't available here. Select and copy the email address.");
        }
      }
    });
    copyButton.hidden = false;
  }
  const form = $('#contact-composer');
  if (enabled('contactComposer') && form && emailLink?.getAttribute('href')?.startsWith('mailto:')) {
    const copy = content?.contact?.composer || {};
    const subject = form.elements.namedItem('subject');
    const message = form.elements.namedItem('message');
    const status = $('#composer-status');
    const fields = [
      { input: subject, error: $('#subject-error'), required: copy.subjectRequired || 'Please add a subject.', long: copy.subjectTooLong || 'Please keep the subject within 160 characters.' },
      { input: message, error: $('#message-error'), required: copy.messageRequired || 'Please add a short message.', long: copy.messageTooLong || 'Please keep the message within 2,000 characters.' }
    ];
    for (const { input, error } of fields) {
      input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); error.hidden = true; status.textContent = ''; });
    }
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      status.textContent = '';
      let firstInvalid;
      for (const field of fields) {
        const value = field.input.value.trim();
        const errorText = !value ? field.required : value.length > field.input.maxLength ? field.long : '';
        field.error.textContent = errorText;
        field.error.hidden = !errorText;
        field.input.setAttribute('aria-invalid', String(Boolean(errorText)));
        if (errorText && !firstInvalid) firstInvalid = field.input;
      }
      if (firstInvalid) { firstInvalid.focus(); return; }
      const subjectText = subject.value.trim().replace(/[\r\n]+/g, ' ');
      const messageText = message.value.trim();
      const draft = `${emailLink.getAttribute('href')}?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(messageText)}`;
      const opened = copy.openedMessage || 'Your email app has been requested. Review and send the message there; this website has not sent it.';
      const fallback = copy.fallbackMessage || 'If your email app did not open, copy the email address and message into your preferred email service.';
      status.textContent = `${opened} ${fallback}`;
      try { window.location.href = draft; } catch { status.textContent = fallback; }
    });
    $('[data-composer-disclosure]').hidden = false;
  }

  if (enabled('scrollReveal') && !reducedMotion.matches && 'IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-revealed');
        revealObserver.unobserve(entry.target);
      }
    }, { threshold: 0.08 });
    $$('[data-reveal]').forEach((node) => revealObserver.observe(node));
  }
  if (enabled('academicCounters') && !reducedMotion.matches && 'IntersectionObserver' in window) {
    const duration = Math.min(1800, Math.max(200, settings?.motion?.counterDurationMs || 900));
    const counterObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        counterObserver.unobserve(entry.target);
        const node = entry.target;
        const finalText = node.textContent;
        const target = Number(node.dataset.counter);
        const decimals = Number(node.dataset.decimals);
        const start = performance.now();
        const step = (now) => {
          const progress = Math.min((now - start) / duration, 1);
          if (reducedMotion.matches || progress >= 1) { node.textContent = finalText; return; }
          const eased = 1 - (1 - progress) ** 3;
          node.textContent = (target * (.8 + .2 * eased)).toFixed(decimals);
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }, { threshold: 0.8 });
    $$('[data-counter]').forEach((node) => counterObserver.observe(node));
  }

  $('[data-dismiss-welcome]')?.addEventListener('click', () => dismissWelcome({ restoreFocus: true }));
  const wideScreen = matchMedia('(min-width: 900px)');
  wideScreen.addEventListener('change', () => { if (!wideScreen.matches) dismissWelcome({ remember: false }); });
  if (welcome && content && enabled('welcomePopup') && settings?.welcomePopup?.enabled && wideScreen.matches && !hadWelcome()) {
    const delay = Math.max(1800, settings.welcomePopup.delayMs || 1800);
    welcomeTimer = setTimeout(() => {
      if (welcomeDismissed || !wideScreen.matches || dialog.isOpen() || banners.isVisible() || document.visibilityState !== 'visible' || document.activeElement?.matches('input, textarea')) return;
      welcome.hidden = false;
      rememberWelcome();
    }, delay);
  }

  return { announce, dialog, banners, dismissWelcome, elements: { installButton: $('[data-pwa-install]') } };
}
