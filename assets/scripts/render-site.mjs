// Editorial rendering source. The generated page is served directly; this module never runs in the browser.
export const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const e = escapeHTML;
const id = (value) => {
  if (!/^[a-z][a-z0-9-]*$/.test(value)) throw new Error(`Invalid stable identifier: ${value}`);
  return value;
};
const number = (value) => {
  if (!Number.isFinite(value) || value < 0) throw new Error('Expected a nonnegative number.');
  return value;
};
export function localURL(value) {
  const path = String(value).replace(/^\.\//, '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(path) || path.split('/').includes('..') || path.includes('//')) {
    throw new Error(`Unsafe relative resource URL: ${value}`);
  }
  return `./${path}`;
}
export function productionURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('productionURL must be an absolute HTTPS directory URL.');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}
const anchor = (value) => `#${id(String(value).replace(/^#/, ''))}`;
const emailURL = (value) => {
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value)) throw new Error('Invalid contact email.');
  return `mailto:${encodeURIComponent(value).replace(/%40/g, '@')}`;
};
const serializedLD = (data) => JSON.stringify(data, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const icons = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  diagonal: '<path d="M6 18 18 6M6 6h12v12"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/>',
  research: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6M10 7v6"/>',
  outreach: '<path d="m3 10 18-7-7 18-4-7-7-4Zm7 4L21 3"/>',
  proposal: '<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h5"/>',
  accounts: '<circle cx="8" cy="8" r="3"/><path d="M2 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M17 15a5 5 0 0 1 5 5"/>',
  coordination: '<rect x="8" y="2" width="8" height="6" rx="1"/><rect x="2" y="16" width="7" height="6" rx="1"/><rect x="15" y="16" width="7" height="6" rx="1"/><path d="M12 8v4M5.5 16v-4h13v4"/>',
  growth: '<path d="M4 21V11M10 21V7M16 21V3M2 21h20M20 13l2-2-2-2"/>'
};
const icon = (name, className = '') => `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[name] || icons.arrow}</svg>`;
const list = (items) => `<ul>${items.map((item) => `<li>${e(item)}</li>`).join('')}</ul>`;
const label = (index, text) => `<p class="eyebrow"><span class="section-index" aria-hidden="true">${String(index).padStart(2, '0')}</span>${e(text)}</p>`;
const heading = (index, section, extra = '') => `<div class="section-heading ${extra}" data-reveal>${label(index, section.eyebrow)}<h2 id="${id(section._id)}-title">${e(section.title)}</h2>${section.description ? `<p class="section-description">${e(section.description)}</p>` : ''}</div>`;
const detailContent = (item, ui) => `<div class="scope-detail-content">${['directResponsibilities', 'coordinatedSupport', 'proposedDeliverables'].map((key) => `<div class="detail-group"><h4>${e(ui[key])}</h4>${list(item[key])}</div>`).join('')}</div>`;
const details = (item, prefix, ui) => `<details class="scope-details" id="${prefix}-${id(item.id)}-details" data-scope-details><summary aria-label="${e(ui.viewDetails)}: ${e(item.title)}">${e(ui.viewDetails)}${icon('plus')}</summary>${detailContent(item, ui)}</details>
<button type="button" class="text-action" data-open-scope="${prefix}-${id(item.id)}-details" aria-label="${e(ui.viewDetails)}: ${e(item.title)}" aria-haspopup="dialog" hidden>${e(ui.viewDetails)}${icon('diagonal')}</button>`;
const picture = (asset, kind) => {
  const source = (format) => asset.sources[format].map((source) => `${localURL(source.src)} ${number(source.width)}w`).join(', ');
  const sizes = kind === 'hero' ? '(min-width: 1280px) 460px, (min-width: 900px) 38vw, (min-width: 600px) 65vw, 88vw' : '(min-width: 1280px) 360px, (min-width: 900px) 31vw, (min-width: 600px) 55vw, 88vw';
  if (!/^\d+(?:\.\d+)?% \d+(?:\.\d+)?%$/.test(asset.objectPosition)) throw new Error('Portrait position must be two percentages.');
  return `<picture><source type="image/webp" srcset="${e(source('webp'))}" sizes="${sizes}"><img src="${e(localURL(asset.src))}" srcset="${e(source('jpeg'))}" sizes="${sizes}" width="${number(asset.width)}" height="${number(asset.height)}" alt="${e(asset.alt)}" loading="${kind === 'hero' ? 'eager' : 'lazy'}"${kind === 'hero' ? ' fetchpriority="high"' : ''} decoding="async" style="object-position:${e(asset.objectPosition)}"></picture>`;
};
const diagrams = [
  '<path d="M34 22h62v52H34zM224 22h62v52h-62zM128 12h64v72h-64z"/><path class="diagram-accent" d="m96 48 32 0m64 0h32M144 32h32M144 44h24M144 56h30M144 68h18"/><circle cx="64" cy="42" r="8"/><path d="M48 63a16 16 0 0 1 32 0M238 35h34M238 48h22M238 61h28"/>',
  '<path d="M32 24h82v38H76L58 77V62H32zM206 35h82v38h-26l-14 13V73h-42z"/><path class="diagram-accent" d="M116 44h70m-9-8 9 8-9 8"/><path d="M46 37h51M46 49h34M220 49h51M220 61h34"/>',
  '<path d="M103 8h88l27 27v53H103zM191 8v27h27"/><path class="diagram-accent" d="M120 27h45M120 43h62M120 55h80M120 67h54"/><path d="m61 49 10 10 21-25M240 30h30M240 42h20M240 54h28"/>',
  '<path d="M34 18h252M34 48h252M34 78h252"/><rect class="diagram-accent" x="62" y="10" width="53" height="16" rx="8"/><rect x="136" y="40" width="62" height="16" rx="8"/><rect class="diagram-accent" x="204" y="70" width="51" height="16" rx="8"/><circle cx="43" cy="18" r="3"/><circle cx="43" cy="48" r="3"/><circle cx="43" cy="78" r="3"/>',
  '<circle cx="59" cy="48" r="23"/><circle class="diagram-accent" cx="160" cy="48" r="30"/><circle cx="261" cy="48" r="23"/><path d="M82 48h48M190 48h48M49 48h20M59 38v20M250 49l8 8 15-17M145 48l10 10 20-23"/>',
  '<path d="M44 14h62v28H44zM129 14h62v28h-62zM214 14h62v28h-62zM44 57h62v28H44zM129 57h62v28h-62zM214 57h62v28h-62z"/><path class="diagram-accent" d="m61 27 7 7 14-14m64 51 7 7 14-14M106 28h23M191 71h23M75 42v15M245 42v15"/>'
];
const diagram = (index) => `<svg class="scope-diagram" viewBox="0 0 320 96" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${diagrams[index % diagrams.length]}</svg>`;
const filters = (group, section, ui) => `<div class="filter-bar" data-filter-controls="${group}" hidden><div class="filter-options" role="group" aria-label="${e(ui[`${group === 'portfolio' ? 'portfolio' : 'tools'}FilterLabel`])}"><button type="button" class="filter-button" data-filter="all" aria-pressed="true">${e(ui.allFilter)}</button>${section.categories.map((category) => `<button type="button" class="filter-button" data-filter="${id(category.id)}" aria-pressed="false">${e(category.label)}</button>`).join('')}</div><p class="filter-count" data-result-count role="status" aria-live="polite" aria-atomic="true" data-template="${e(ui.resultsTemplate)}" data-noun="${e(group === 'portfolio' ? ui.portfolioResultNoun : ui.toolsResultNoun)}">${e(ui.resultsTemplate.replace('{count}', section.items.length).replace('{noun}', group === 'portfolio' ? ui.portfolioResultNoun : ui.toolsResultNoun))}</p></div>`;

export function renderSite(content, settings, version) {
  const { profile: p, home, about, services, portfolio, tools, experience, education, contact, footer, ui } = content;
  const url = productionURL(settings.productionURL);
  const absolute = (resource) => new URL(localURL(resource), url).href;
  const mailto = emailURL(p.email);
  if (content.verifiedMetrics.length || settings.features.verifiedMetrics || settings.verifiedMetrics.enabled) throw new Error('Unverified performance metrics must remain disabled and empty.');
  const tokenNames = { navy: 'navy', blue: 'blue', cyan: 'cyan', white: 'white', warmWhite: 'paper', gold: 'gold', ink: 'ink', muted: 'muted', border: 'line' };
  const tokens = Object.entries(tokenNames).map(([key, name]) => {
    const value = settings.design.colors[key];
    if (!/^#[\da-f]{6}$/i.test(value)) throw new Error(`Invalid semantic color: ${key}`);
    return `--${name}:${value};`;
  });
  for (const key of ['display', 'body']) {
    const value = settings.design.typography[key];
    if (!/^[a-zA-Z\s,'"-]+$/.test(value)) throw new Error('Unsafe font-family configuration.');
    tokens.push(`--font-${key}:${value};`);
  }
  const social = settings.assets.images.social;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Person', '@id': `${url.href}#person`, name: p.name, jobTitle: p.role, description: p.summary, url: url.href, image: absolute(settings.assets.images.hero.src), email: p.email, address: { '@type': 'PostalAddress', addressLocality: p.location.city, addressCountry: p.location.country }, knowsLanguage: about.languages.map((item) => item.name) },
      { '@type': 'WebSite', '@id': `${url.href}#website`, url: url.href, name: p.name, description: content.meta.description, inLanguage: content.meta.language, publisher: { '@id': `${url.href}#person` } }
    ]
  };
  const head = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(content.meta.title)}</title>
<meta name="description" content="${e(content.meta.description)}">
<meta name="theme-color" content="${e(settings.design.colors.navy)}">
<meta name="portfolio-release" content="${e(version.version)}">
<meta name="portfolio-release-token" content="">
<meta name="color-scheme" content="light">
<link rel="canonical" href="${e(url.href)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${e(p.name)}">
<meta property="og:title" content="${e(content.meta.title)}">
<meta property="og:description" content="${e(content.meta.description)}">
<meta property="og:url" content="${e(url.href)}">
<meta property="og:locale" content="${e(content.meta.locale)}">
<meta property="og:image" content="${e(absolute(social.src))}">
<meta property="og:image:width" content="${number(social.width)}">
<meta property="og:image:height" content="${number(social.height)}">
<meta property="og:image:type" content="${e(social.type)}">
<meta property="og:image:alt" content="${e(social.alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(content.meta.title)}">
<meta name="twitter:description" content="${e(content.meta.description)}">
<meta name="twitter:image" content="${e(absolute(social.src))}">
<meta name="twitter:image:alt" content="${e(social.alt)}">
<link rel="icon" href="${e(localURL(settings.assets.icons.favicon.src))}" type="image/svg+xml" sizes="any">
<link rel="apple-touch-icon" href="${e(localURL(settings.assets.icons.appleTouch.src))}" sizes="180x180">
${settings.features.pwa && settings.pwa.enabled ? '<link rel="manifest" href="./manifest.json">' : ''}
<style id="site-design-tokens">:root{${tokens.join('')}}</style>
<link rel="stylesheet" href="./assets/css/site.css">
<script type="application/ld+json">${serializedLD(ld)}</script>`;
  const accentStart = home.accentText && home.title.endsWith(home.accentText) ? home.title.slice(0, -home.accentText.length) : home.title;
  const heroTitle = e(accentStart) + (accentStart !== home.title ? `<em>${e(home.accentText)}</em>` : '');
  const page = `<a class="skip-link" href="#main-content">${e(ui.skipToContent)}</a>
<header class="site-header" id="site-header">
  <div class="header-inner container">
    <a class="brand" href="#home" aria-label="${e(p.initials)} ${e(p.name)} — ${e(content.nav[0].label)}"><span class="brand-mark" aria-hidden="true">${e(p.initials)}</span> <span class="brand-name">${e(p.name)}</span></a>
    <button class="menu-toggle" type="button" aria-controls="primary-nav" aria-expanded="false" data-open-label="${e(ui.openMenu)}" data-close-label="${e(ui.closeMenu)}" aria-label="${e(ui.openMenu)}" hidden><span></span><span></span><span class="sr-only">${e(ui.openMenu)}</span></button>
    <nav class="primary-nav" id="primary-nav" aria-label="${e(ui.navigationLabel)}">${content.nav.map((item) => `<a href="#${id(item.id)}"${item.id === 'home' ? ' aria-current="location"' : ''}>${e(item.label)}${item.id === 'contact' ? icon('diagonal') : ''}</a>`).join('')}</nav>
  </div>
</header>
<main id="main-content" tabindex="-1">
  <section class="hero dark-section" id="home" aria-labelledby="home-title" tabindex="-1">
    <div class="container hero-grid">
      <div class="hero-copy">
        <p class="eyebrow hero-eyebrow"><span class="fine-line" aria-hidden="true"></span>${e(home.eyebrow)}</p>
        <h1 id="home-title">${e(p.name)}</h1>
        <p class="hero-role">${e(p.role)}</p>
        <h2 class="hero-statement">${heroTitle}</h2>
        <p class="hero-description">${e(home.description)}</p>
        <div class="hero-actions"><a class="button button-blue" href="${anchor(home.primaryAction.href)}">${e(home.primaryAction.label)}${icon('diagonal')}</a><a class="text-action light-action" href="${anchor(home.secondaryAction.href)}">${e(home.secondaryAction.label)}${icon('arrow')}</a></div>
        <div class="hero-context"><span>${icon('pin')}${e(p.location.label)}</span><span>${icon('globe')}${e(p.workingHours)}</span></div>
      </div>
      <figure class="hero-portrait">
        <div class="portrait-frame">${picture(settings.assets.images.hero, 'hero')}</div>
        <div class="portrait-tag"><span class="tag-symbol" aria-hidden="true">${icon('coordination')}</span><div><strong>${e(home.portraitTag)}</strong><span>${e(home.portraitTagDetail)}</span></div></div>
        <figcaption><span aria-hidden="true">01 /</span>${e(home.portraitCaption)}</figcaption>
        <span class="portrait-side-note" aria-hidden="true">${e(p.collaboration)}</span>
      </figure>
    </div>
    <div class="hero-bottom container"><span>${e(p.collaboration)}</span><a href="#about">${e(about.eyebrow)}${icon('arrow')}</a><span class="hero-bottom-mark" aria-hidden="true">AT /</span></div>
  </section>
  <section class="section about-section" id="about" aria-labelledby="about-title" tabindex="-1">
    <div class="container">
      <div class="about-grid">
        <figure class="about-portrait" data-reveal><div class="about-photo">${picture(settings.assets.images.about, 'about')}</div><figcaption>${e(about.portraitCaption)}</figcaption><span class="portrait-monogram" aria-hidden="true">a.t.</span></figure>
        <div class="about-copy">${heading(1, { ...about, _id: 'about' })}${about.paragraphs.map((paragraph) => `<p>${e(paragraph)}</p>`).join('')}<div class="language-line"><span>${e(about.languagesTitle)}</span><ul>${about.languages.map((language) => `<li>${e(language.name)}</li>`).join('')}</ul></div></div>
      </div>
      <div class="expertise-block" data-reveal><div><p class="eyebrow">${e(about.coreExpertiseTitle)}</p><h3>${e(about.expertiseIntro)}</h3></div><ul class="expertise-list">${about.coreExpertise.map((item, index) => `<li><span aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>${e(item.title)}</li>`).join('')}</ul></div>
      <aside class="collaboration-note">${icon('globe')}<div><h3>${e(about.internationalCollaboration.title)}</h3><p>${e(about.internationalCollaboration.description)}</p><p class="small-note">${e(about.internationalCollaboration.schedulingNote)}</p></div></aside>
    </div>
  </section>
  <section class="section services-section" id="services" aria-labelledby="services-title" tabindex="-1">
    <div class="container">${heading(2, { ...services, _id: 'services' })}
      <div class="services-grid">${services.items.map((item, index) => `<article class="service-card" data-reveal data-scope-card><div class="service-top">${icon(['research', 'outreach', 'proposal', 'accounts', 'coordination', 'growth'][index])}<span aria-hidden="true">${String(index + 1).padStart(2, '0')}</span></div><h3 data-scope-title>${e(item.title)}</h3><p data-scope-description>${e(item.summary)}</p>${details(item, 'service', ui)}</article>`).join('\n')}
      </div><p class="implementation-note">${icon('coordination')}<span>${e(services.implementationNote)}</span></p>
    </div>
    <div class="process-band dark-section"><div class="container"><div class="process-heading"><p class="eyebrow">${e(services.process.eyebrow)}</p><h3>${e(services.process.title)}</h3></div><ol class="process-grid">${services.process.items.map((item, index) => `<li><span class="process-number" aria-hidden="true">0${index + 1}</span><h4>${e(item.title)}</h4><p>${e(item.description)}</p></li>`).join('')}</ol></div></div>
  </section>
  <section class="section portfolio-section" id="portfolio" aria-labelledby="portfolio-title" tabindex="-1">
    <div class="container">${heading(3, { ...portfolio, _id: 'portfolio' })}
      <p class="scope-disclaimer">${icon('proposal')}<span>${e(portfolio.disclaimer)}</span></p>
      <div data-filter-group="portfolio">${filters('portfolio', portfolio, ui)}
        <div class="portfolio-grid">${portfolio.items.map((item, index) => {
          if (item.kind !== 'representative') throw new Error('Only representative scopes are approved.');
          return `<article class="portfolio-card" id="scope-${id(item.id)}" data-filter-item data-categories="${item.categories.map(id).join(' ')}" data-scope-card data-kind="representative" data-reveal><div class="scope-visual"><div class="scope-kicker"><span>${e(ui.representativeBadge)}</span><span aria-hidden="true">${String(index + 1).padStart(2, '0')} / ${String(portfolio.items.length).padStart(2, '0')}</span></div>${diagram(index)}</div><div class="scope-copy"><p class="scope-category">${item.categories.map((category) => e(portfolio.categories.find((entry) => entry.id === category)?.label || category)).join(' / ')}</p><h3 data-scope-title>${e(item.title)}</h3><p data-scope-description>${e(item.summary)}</p>${details(item, 'portfolio', ui)}</div></article>`;
        }).join('\n')}</div><p class="empty-state" data-filter-empty hidden>${e(ui.emptyResults)}</p>
      </div>
    </div>
  </section>
  <section class="section tools-section dark-section" id="tools" aria-labelledby="tools-title" tabindex="-1">
    <div class="container">${heading(4, { ...tools, _id: 'tools' })}
      <div data-filter-group="tools">${filters('tools', tools, ui)}<ul class="tools-grid">${tools.items.map((item) => `<li class="tool-item" data-filter-item data-categories="${item.categories.map(id).join(' ')}"><span class="tool-monogram" aria-hidden="true">${e(item.name.replace(/[^a-zA-Z]/g, '').slice(0, 2))}</span><div><h3>${e(item.name)}</h3><p>${item.categories.map((category) => e(tools.categories.find((entry) => entry.id === category)?.label || category)).join(' / ')}</p></div></li>`).join('')}</ul><p class="empty-state" data-filter-empty hidden>${e(ui.emptyResults)}</p></div><p class="tools-disclaimer"><span>${e(ui.toolFamiliarityLabel)}</span>${e(tools.disclaimer)}</p>
    </div>
  </section>
  <section class="section experience-section" id="experience" aria-labelledby="experience-title" tabindex="-1">
    <div class="container experience-grid">${heading(5, { ...experience, _id: 'experience' })}<ol class="timeline">${experience.items.map((item, index) => `<li data-reveal><div class="timeline-date"><time datetime="${e(item.startDate)}">${e(item.period)}</time><span class="timeline-number" aria-hidden="true">0${index + 1}</span></div><div class="timeline-content"><h3>${e(item.role)}</h3><p>${e(item.organization)}</p>${item.endDate === null ? `<span class="current-role">${e(experience.presentLabel)}</span>` : ''}</div></li>`).join('')}</ol></div>
  </section>
  <section class="section education-section" id="education" aria-labelledby="education-title" tabindex="-1">
    <div class="container">${heading(6, { ...education, _id: 'education' })}<div class="education-grid">${education.items.map((item) => {
      const milestone = education.academicMilestones.find((entry) => entry.id === item.milestoneId);
      return `<article class="education-card" data-reveal><p class="education-date">${e(item.period)}</p><h3>${e(item.qualification)}</h3><p class="institution">${e(item.institution)}</p>${milestone ? `<div class="academic-score"><span class="sr-only">${e(milestone.displayValue)} — ${e(milestone.label)}</span><span class="score-value" aria-hidden="true"><span data-counter="${number(milestone.value)}" data-decimals="${number(milestone.decimalPlaces)}">${milestone.value.toFixed(milestone.decimalPlaces)}</span><span class="score-maximum"> / ${number(milestone.maximum).toFixed(milestone.decimalPlaces)}</span></span><span class="score-label" aria-hidden="true">${e(milestone.label)}</span></div>` : ''}</article>`;
    }).join('')}</div></div>
  </section>
  <section class="section contact-section dark-section" id="contact" aria-labelledby="contact-title" tabindex="-1">
    <div class="container"><div class="contact-grid"><div class="contact-copy">${heading(7, { ...contact, _id: 'contact' })}<a class="contact-email" href="${e(mailto)}" aria-label="${e(contact.emailLabel)}: ${e(p.email)}"><span data-email-address>${e(p.email)}</span>${icon('diagonal')}</a><button type="button" class="text-action copy-email light-action" data-copy-email hidden>${icon('copy')}${e(contact.copyEmailLabel)}</button><div class="email-fallback" data-email-fallback hidden><label for="copyable-email">${e(contact.emailCopyFallback)}</label><input id="copyable-email" type="text" value="${e(p.email)}" readonly autocomplete="off"></div><dl class="contact-context"><div><dt>${e(contact.locationLabel)}</dt><dd>${e(p.location.label)}</dd></div><div><dt>${e(contact.collaborationLabel)}</dt><dd>${e(p.collaboration)}</dd></div><div><dt>${e(contact.workingHoursLabel)}</dt><dd>${e(p.workingHours)}</dd></div></dl></div>
      <div class="contact-side"><div class="contact-letter" aria-hidden="true"><span>${e(p.initials)}</span>${icon('mail')}<span class="letter-rule"></span></div><details class="composer-disclosure" data-composer-disclosure hidden><summary>${e(contact.composer.title)}${icon('plus')}</summary><div class="composer-content"><p>${e(contact.composer.description)}</p><form id="contact-composer" novalidate><div class="field"><label for="email-subject">${e(contact.composer.subjectLabel)}</label><input id="email-subject" name="subject" type="text" placeholder="${e(contact.composer.subjectPlaceholder)}" maxlength="${number(settings.contact.composer.subjectMaxLength)}" required aria-describedby="subject-error"><p id="subject-error" class="field-error" hidden></p></div><div class="field"><label for="email-message">${e(contact.composer.messageLabel)}</label><textarea id="email-message" name="message" rows="4" placeholder="${e(contact.composer.messagePlaceholder)}" maxlength="${number(settings.contact.composer.messageMaxLength)}" required aria-describedby="message-error"></textarea><p id="message-error" class="field-error" hidden></p></div><button type="submit" class="button button-blue">${e(contact.composer.submitLabel)}${icon('diagonal')}</button><p class="composer-privacy">${e(contact.composer.privacyNote)}</p><p class="composer-status" id="composer-status" role="status" aria-live="polite"></p></form></div></details><p class="contact-signature">${e(footer.signature)}</p></div>
    </div></div>
  </section>
</main>
<footer class="site-footer"><div class="container footer-top"><a class="footer-name" href="#home">${e(p.name)}</a><a class="back-top" href="#home" data-back-top>${e(footer.backToTopLabel)}${icon('arrow')}</a></div><div class="container footer-bottom"><p>© ${e(footer.copyright)}</p><p>${e(footer.privacyNote)}</p><button type="button" class="text-action" data-pwa-install hidden>${e(ui.pwa.installLabel)}${icon('plus')}</button></div></footer>
<dialog class="site-dialog" id="scope-dialog" aria-labelledby="dialog-title" aria-describedby="dialog-description"><div class="dialog-top"><p class="eyebrow" id="dialog-eyebrow"></p><button type="button" class="icon-button" data-dialog-close aria-label="${e(ui.closeDialog)}">${icon('close')}</button></div><h2 id="dialog-title" tabindex="-1"></h2><p id="dialog-description"></p><div id="dialog-content"></div></dialog>
<div class="notice-stack" id="notice-stack"><aside class="notice welcome-notice" id="welcome-panel" aria-labelledby="welcome-title" hidden><button type="button" class="notice-close icon-button" data-dismiss-welcome aria-label="${e(ui.welcome.dismissLabel)}">${icon('close')}</button><p class="eyebrow">${e(p.name)}</p><h2 id="welcome-title">${e(ui.welcome.title)}</h2><p>${e(ui.welcome.message)}</p><a class="text-action" data-welcome-action href="${anchor(ui.welcome.actionHref)}">${e(ui.welcome.actionLabel)}${icon('arrow')}</a></aside><aside class="notice pwa-notice" id="pwa-banner" aria-labelledby="pwa-banner-title" hidden><h2 id="pwa-banner-title"></h2><p id="pwa-banner-description"></p><div class="notice-actions"><button type="button" class="button button-blue" data-banner-action></button><button type="button" class="text-action" data-banner-dismiss></button></div></aside></div>
<p class="sr-only" id="site-announcer" role="status" aria-live="polite" aria-atomic="true"></p>`;
  return { head, page, language: content.meta.language, url };
}

export function renderFallback(content, settings, kind) {
  const copy = content.ui.fallback;
  const page = copy[kind];
  const colors = settings.design.colors;
  const home = productionURL(settings.productionURL).href;
  return `<!doctype html>
<html lang="${e(content.meta.language)}">
<head>
<!-- Generated by sync-content.mjs from canonical JSON and render-site.mjs. -->
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, follow">
<meta name="theme-color" content="${e(colors.navy)}">
<title>${e(page.title)} | ${e(content.profile.name)}</title>
<base href="${e(home)}">
<script>
// The absolute configured base also works without JavaScript on nested 404 URLs.
// The worker substitutes its actual base for controlled offline/error responses.
// Never infer a deployment from a missing URL ending in 404.html or offline.html.
(() => {
  const base = document.querySelector('base');
  const configured = new URL(base.href);
  if (location.pathname.startsWith(configured.pathname)) {
    base.href = new URL(configured.pathname, location.origin).href;
  }
})();
</script>
<style>
:root{color-scheme:light;--navy:${colors.navy};--paper:${colors.warmWhite};--gold:${colors.gold};--ink:${colors.ink};--line:${colors.border}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:${settings.design.typography.body};line-height:1.65}a{color:inherit;text-underline-offset:.25em}a:focus-visible,button:focus-visible{outline:3px solid var(--gold);outline-offset:6px}header,main,footer{width:min(100% - 3rem,68rem);margin-inline:auto}header{padding-block:2rem;display:flex;align-items:center;gap:1rem}.mark{display:grid;place-items:center;width:3rem;height:3rem;border:1px solid var(--gold);font-family:${settings.design.typography.display};color:var(--navy)}.name{text-decoration:none;font-weight:600}main{padding-block:clamp(3rem,10vw,8rem);min-height:62vh;position:relative;border-top:1px solid var(--line)}.eyebrow{text-transform:uppercase;letter-spacing:.18em;font-size:.75rem;font-weight:600}h1{font-family:${settings.design.typography.display};font-size:clamp(3rem,9vw,6rem);font-weight:400;letter-spacing:-.055em;line-height:1.05;max-width:12ch;margin:1.5rem 0}main p:not(.eyebrow){max-width:38rem}nav{display:flex;gap:1.5rem;align-items:center;flex-wrap:wrap;margin-top:2rem}.home{display:inline-block;background:var(--navy);color:var(--paper);padding:.85rem 1.3rem;text-decoration:none}.code{margin-top:3rem;font-size:.8rem;letter-spacing:.08em}button{font:inherit;color:inherit;border:0;background:none;padding:.5rem 0;cursor:pointer;text-decoration:underline;text-underline-offset:.25em}footer{border-top:1px solid var(--line);padding-block:1.5rem 2.5rem;font-size:.85rem}footer a{overflow-wrap:anywhere}footer p{max-width:42rem}[hidden]{display:none!important}@media(prefers-reduced-motion:no-preference){.home{transition:transform .2s}.home:hover{transform:translateY(-2px)}}
</style>
</head>
<body>
<header><span class="mark" aria-hidden="true">${e(content.profile.initials)}</span><a class="name" href="./">${e(content.profile.name)}</a></header>
<main id="main-content"><p class="eyebrow">${e(page.eyebrow)}</p><h1>${e(page.title)}</h1><p>${e(page.description)}</p><nav aria-label="${e(content.ui.navigationLabel)}"><a class="home" href="./">${e(copy.homeLabel)}</a><a href="./#contact">${e(copy.contactLabel)}</a>${kind === 'offline' ? `<button type="button" id="retry" hidden>${e(copy.retryLabel)}</button>` : ''}</nav><p class="code">${e(page.code)}</p></main>
<footer><a href="${e(emailURL(content.profile.email))}">${e(content.profile.email)}</a><p>${e(copy.emailNote)}</p><p>© ${e(content.footer.copyright)} ${e(content.footer.privacyNote)}</p></footer>
<script>
const retry = document.getElementById('retry');
if (retry) { retry.addEventListener('click', () => location.reload()); retry.hidden = false; }
</script>
</body>
</html>
`;
}
