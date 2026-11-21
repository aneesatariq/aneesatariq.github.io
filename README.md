# Aneesa Tariq — personal portfolio

A static, navy-and-ivory portfolio for business development, client acquisition, and international collaboration. The complete semantic page works without JavaScript. Vanilla modules progressively add filters, shared detail dialogs, an email composer, and optional offline/install support. No framework, external font service, package installation, analytics, backend, or hosting build is required.

## Local setup

Use an HTTP server rather than opening the page as a file. For a loopback-only root preview on Windows with Python installed:

```powershell
py -m http.server 8080 --bind 127.0.0.1 --directory "d:\Servers\Laragon\www\aneesatariq"
```

Open `http://127.0.0.1:8080/`. Stop the server with Ctrl+C when finished. A browser can treat loopback HTTP as a secure context; public hosting requires HTTPS. An ordinary HTTP Laragon `.test` hostname generally does not qualify for service workers, although the static portfolio still works.

For a subpath preview, serve the parent directory on a separate port:

```powershell
py -m http.server 8081 --bind 127.0.0.1 --directory "d:\Servers\Laragon\www"
```

Open `http://127.0.0.1:8081/aneesatariq/`. This exposes the parent directory to local applications only; do not bind it to a public interface. Python's basic server returns real 404 statuses but does not automatically serve the custom 404 body. A controlled page's worker supplies that body. Test first-visit custom errors using an appropriately configured static server as described below.

Node.js 22 or newer is needed only for editorial synchronization and optional verification, not for hosting or visiting the site. Synchronization and invariant checks are dependency-free. Optional browser acceptance requires a separately available Playwright installation and Chrome or Edge; Lighthouse is also optional. Neither is a website runtime dependency.

## File map and ownership

- `assets/json/content.json`: editorial source, supplied experience/education, representative service scopes, labels, fallback-page copy, and contact details.
- `assets/json/settings.json`: feature flags, design tokens, production URL, media candidates, icons, and PWA behavior.
- `assets/json/version.json`: semantic release version and release date.
- `assets/scripts/render-site.mjs`: maintained HTML/metadata/fallback templates.
- `assets/scripts/sync-content.mjs`: dependency-free maintenance generator; also exports `createProjections` and `createReleaseToken` for verification.
- `index.html`: published semantic snapshot; edit the marked generated regions through JSON/templates, not directly.
- `assets/css/site.css`: authored layout, breakpoints, components, accessibility, and motion. No CSS build step.
- `assets/js/data.js`: JSON loading and module-relative deployment base; fails safely to static content if releases disagree.
- `assets/js/ui.js`: one dialog/focus owner, filters, navigation, contact, welcome, and shared notice presentation.
- `assets/js/pwa.js`: capability-aware installation, explicit update actions, connectivity notices, and fresh version checks.
- `assets/js/app.js`: sole initializer; optional PWA enhancement is enabled.
- `sw.js`: maintained worker logic plus a generated release token, explicit resource list, byte sizes, and SHA-256 integrity values.
- `manifest.json`, `offline.html`, `404.html`, `robots.txt`, `sitemap.xml`: generated publication snapshots.
- `assets/image/covers/`: preserved originals, optimized portrait derivatives, and the supplied social image.
- `assets/image/icons/`: original AT monogram SVG and regular/maskable/Apple PNG variants.
- `assets/scripts/generate-images.py`: optional Pillow-based image maintenance, not a serving dependency.
- `assets/scripts/pwa-invariants.test.mjs`: dependency-free Node checks; a lifecycle mock, not a substitute for browser acceptance.
- `assets/scripts/browser-acceptance.test.mjs`: optional Playwright acceptance using isolated in-memory root/subpath, update, and fault fixtures; also summarizes Lighthouse JSON reports.
- `.gitattributes`: LF text bytes for reliable release integrity on Windows and GitHub.
- `.nojekyll`: disables Jekyll transformation so Pages serves the static publication bytes.
- `.htaccess`: retains Apache's `Options -Indexes`. GitHub Pages and Python's server ignore it.
- Asset-directory `index.html` files discourage directory browsing and link back to the deployment root. They are not access controls; directly addressed public files remain accessible.

## Canonical JSON and configuration

All three JSON documents carry `schemaVersion`. Keep the existing schema shape unless the data loader, renderer, and maintenance validation are deliberately updated together. JSON does not support comments or trailing commas. The generator performs targeted structural/safety checks, not a complete JSON Schema implementation.

### Editorial content

`content.json` groups `meta`, `profile`, `nav`, `ui`, the eight page sections, `footer`, and `verifiedMetrics`. Item/category IDs are stable lowercase hyphenated identifiers. Portfolio items retain `kind: representative`, their category/service relationships, direct responsibilities, coordinated specialist support, and proposed deliverables. These are illustrative capabilities, not completed client case studies.

Preserve the supplied employers, roles, dates, overlapping experience, qualifications, and academic results. Do not infer new availability, proficiency, clients, outcomes, endorsements, certifications, social links, or a résumé. Structured data is intentionally limited to Person and WebSite; it contains no reviews, ratings, or invented accomplishments.

`verifiedMetrics` stays empty, and both metrics switches remain false. The generator rejects attempts to publish metrics under the current contract. Any future professional metrics require owner approval, a verifiable source and timeframe, and an explicit rendering/validation change—not simply switching a flag. Academic milestones are supplied educational results, not professional performance claims.

### Design and layout

`settings.design.colors` projects semantic CSS variables: navy, blue, cyan, white, paper, gold, ink, muted, and line. `settings.design.typography` projects the display/body font stacks without remote font requests. Layout widths, spacing, cards, breakpoints, and interaction states remain authored in `site.css`; JSON is not an arbitrary stylesheet interpreter. Change design tokens in JSON and synchronize. Change layout in the stylesheet and synchronize again so its release hash changes.

Portrait settings define fallback `src`, intrinsic size, alt text, object position, and WebP/JPEG `sources`. Every candidate used by the two pictures belongs to the offline release. The offline generator deliberately allows only the optimized 480/800/1200 derivatives, not original PNGs.

### Feature flags and fixed safety policies

- `features.portfolioFilters`, `toolFilters`, `detailDialogs`, `scrollReveal`, `academicCounters`, `copyEmail`, `contactComposer`, and `backToTop` control their progressive enhancements.
- Welcome requires both `features.welcomePopup` and `welcomePopup.enabled`. It is intentionally **desktop-only at 900px and above**, nonmodal, delayed at least 1.8 seconds, and does not steal focus. Focus in a form, hidden tabs, active dialogs, or PWA notices suppress it. Seen-state storage is deployment-scoped and falls back through local/session storage to memory; blocked storage does not break the site.
- PWA initialization and the manifest link require both `features.pwa` and `pwa.enabled`.
- `pwa.install.enabled` controls the explicit install/help control. Native installation is offered only when a real browser prompt exists; otherwise it opens honest browser guidance.
- `pwa.update.enabled` controls application-level checks and update notices. Browsers may still discover a worker update; without acceptance it waits until old clients close.
- `pwa.update.reloadAfterActivation` permits a reload only in the tab that explicitly accepted, at most once. With it false, activation is followed by an explicit reload notice.
- `pwa.offline.enabled` controls worker precaching/interception and offline notices. False leaves networking to the browser; there is then no offline/release-cache guarantee.
- The generator enforces deployment-scoped cache names, explicit update confirmation, no automatic install prompt, supported-browser native installation, no original-image precaching, a maximum 2,000,000-byte release, and disabled telemetry. These are safety policies, not switches for unsafe modes.
- Disabling a flag in new JSON is not an instant kill switch for an already installed older worker: visitors keep their older release until its replacement activates. Publish a synchronized replacement and let the normal update lifecycle complete.

`productionURL` is an absolute HTTPS directory URL, including the project path when relevant. Its default is `https://aneesatariq.github.io/`. It supplies canonical/social/schema URLs, sitemap URLs, and the no-JavaScript fallback-page base. Runtime assets and registration instead resolve from their module/worker directory. Keep deployment base settings relative (`./`); do not hard-code runtime assets to `/`. Manifest `id`, `start_url`, and `scope` remain `.` relative to the manifest.

`version.json` contains `version` in semantic version form and `releaseDate` in `YYYY-MM-DD` form. Use patch increments for compatible corrections, minor increments for compatible features, and major increments for intentional incompatible changes. Do not hand-maintain another version in a worker or manifest.

## Synchronizing source and snapshots

After any editorial, configuration, runtime code, stylesheet, or published image change:

```powershell
node assets/scripts/sync-content.mjs
node assets/scripts/sync-content.mjs --check
```

`--help` explains usage. No flags write synchronized artifacts. `--check` is read-only and exits nonzero for missing/stale projections, invalid safety configuration, or an excessive release budget. It covers HTML regions, metadata/tokens, fallbacks, manifest, worker release information, robots, sitemap, and normalized release text. It does not silently rewrite authored UI logic. Text normalization is limited to BOM removal and LF line endings.

The generator is deterministic: no clock, timestamps from the machine, randomness, or network lookups. It hashes all release resources and worker logic with the generated worker block removed, inserts the resulting token into HTML, then computes final integrity hashes. The worker itself is not precached or included in its own digest. A version-only JSON edit changes the worker bytes after synchronization. Repeating synchronization without source changes yields no new release.

Keep `.gitattributes` and `.nojekyll` in the published tree. Integrity depends on identical decoded resource bytes: do not let a host minify HTML/JS/CSS, inject scripts, rewrite JSON, or convert line endings after synchronization. Ordinary HTTP compression is fine. LF handling prevents Git's Windows checkout normalization from invalidating the hashes. All release files must be published together; never upload only the JSON or only the worker.

## Portraits and icons

The originals remain preserved. The optional image utility requires Python 3 and an existing Pillow installation with JPEG/WebP support. It has explicit crop/dimension guards; review the portrait composition and update those guards if replacing the source photographs.

```powershell
py assets/scripts/generate-images.py --only portraits
py assets/scripts/generate-images.py --only icons
node assets/scripts/sync-content.mjs
```

Use `--help` for options. The original monogram SVG is the icon source. Regular icons are 192/512, the maskable icon is 512 with a safe inset, and the Apple icon is 180. Encoder-version differences can change compressed bytes: review outputs and synchronize instead of assuming reproducible image encoding across Pillow versions. No image generation or dependency installation is required to host the supplied assets.

## Offline and update correctness

The default release precaches **29 resources** within a **2,000,000-byte** decoded-payload ceiling. Synchronization prints the exact current total; the generated worker records every path, digest, and byte size.

Included: the homepage, standalone offline/404 pages, manifest, one stylesheet, four runtime modules, three JSON documents, all twelve portrait candidates, and five icons. Excluded: original portraits, Inixio assets, social-preview-only media, maintenance scripts/tests, documentation, résumé directories, directory placeholders, and unknown/API responses. Cache metadata and HTTP/browser storage overhead are outside this payload budget.

Installation uses one atomic Cache API batch with same-origin credentials, redirect rejection, cache revalidation, and per-file integrity. Missing files, soft-404 substitutions, mixed upload bytes, or storage failures reject installation; errors are not swallowed to install a partial release. Existing releases are not overwritten. This is atomic **worker installation**, not a guarantee that a host publishes files atomically: first uncontrolled visits still need a coherent server snapshot.

Known HTML/CSS/JS/JSON/media are cache-first and release-pinned. Each navigation adopts the active release; existing tabs persist a client-to-release pin so later resource requests do not mix with another tab's accepted update. Query strings and hashes on the exact deployment homepage or `index.html` are not new routes. Other paths use the network: a real server 404 receives the custom page with status 404; an unreachable unknown page receives the offline page with status 503. An unavailable cached homepage is not silently replaced with a newer network document.

Only same-origin, in-scope GETs are intercepted. Unknown resources remain network-only and are not added to caches. Fresh `version.json?release-check=1` checks explicitly bypass release JSON with no-store requests; they do not mutate the UI's cached configuration. Worker update checks also run after registration and eligible online/visible events, throttled to once per minute. Availability comes from a genuinely waiting worker, not merely from a newer version string.

There is no unconditional `skipWaiting`. A waiting worker activates after an explicit update action, or through the browser's normal lifecycle once all old clients close. Initial clean installation may claim the page without reloading. Accepting an update reloads only the accepting tab, once, when configured; other tabs receive a notice and preserve their drafts. The action warns that unsent text will be cleared. If a draft changes during activation, automatic reload is suppressed and another explicit action is required. “Later” defers reminders for at least a minute and they return on subsequent interaction/visibility checks, not through a forced timer reload.

Cache names contain the app namespace, encoded deployment path, and generated release token. Cleanup touches only that exact deployment's release caches. It conservatively retains **all** old releases while any deployment window exists, including unclaimed/suspended tabs, or another worker is installing/waiting. Cleanup occurs at an activation where no deployment windows or pending workers are reported; close all tabs and allow a later update to activate for this boundary. Preserving pending workers prevents delayed activation from deleting a newer release's cache. This favors old-tab correctness over aggressive disk cleanup; total storage can exceed one release's budget. Client-pin metadata is cleared at the same boundary. Unrecognized legacy scaffold caches and other apps' caches are deliberately left alone.

Limitations: browser storage eviction, user-cleared data, private-mode restrictions, discarded/back-forward-cache clients, and a tab opening around a client-enumeration boundary cannot be made fully transactional across browsers. If a mandatory cached file has been evicted, it fails closed instead of mixing releases; reconnect, close portfolio tabs, and reopen so an updated worker can activate. If the active release still cannot recover, use browser site-data controls for this deployment/origin, understanding that other apps on that origin may also be affected. Never delete all origin caches automatically. Revalidate real multi-tab lifecycle behavior after worker changes; local Chrome/Edge acceptance is recorded below.

Connectivity feedback is dismissible and uses the single shared notice surface, with update priority and no welcome stacking. Dismissing offline feedback does not hide the explicit install control. `navigator.onLine` is only a connectivity hint, not proof that a particular server is reachable.

## Installation and privacy

Chromium-family browsers may emit `beforeinstallprompt`; only then is the control a real native Install action. The prompt is called from a visitor click, never automatically. `appinstalled` and standalone detection hide the install control. Install support, engagement criteria, browser menus, OS policies, and uninstall detection vary.

iPhone/iPad visitors get concise Safari Share → Add to Home Screen guidance; desktop visitors can check their browser's install menu. Unsupported platforms can bookmark the portfolio. Safari/iOS behavior must be checked on actual devices and is not established by a Chromium desktop test. Offline access requires one successful complete online installation and retained browser storage; it cannot work on a never-visited device.

The contact composer creates a `mailto:` draft and opens the visitor's mail application. Nothing is submitted, sent, or stored by this website. Sending happens in that mail app and may require connectivity. No backend, cookies for tracking, analytics, remote fonts, tracking pixels, or third-party runtime scripts are added. Browser-managed cache/installation state and deployment-scoped welcome seen-state are local conveniences, not telemetry.

## Publishing to GitHub Pages (owner action only)

No push or deployment is performed by the maintenance utility.

1. **User-site root:** use the intended `aneesatariq.github.io` repository and keep `productionURL` at `https://aneesatariq.github.io/`.
2. **Project site:** use the intended repository and set `productionURL` to its full HTTPS directory URL, for example `https://aneesatariq.github.io/portfolio/`. Synchronize; do not edit absolute URLs by hand. The manifest and worker remain deployment-relative.
3. Review content, set the next semantic version/release date, synchronize, and run the separate verification commands/checklist below. Review all changes and ensure the whole static tree, generated files, `.gitattributes`, and `.nojekyll` are included in the owner's eventual publication.
4. In repository Settings → Pages, select the intended publishing branch and its root folder. No custom build command or Node/Python installation is required on the host. A custom domain requires its final HTTPS URL in settings and another synchronized release.
5. Publish only when separately authorized. After publication, verify real content types, paths, custom-404 status, manifest, and the old-to-new waiting-worker flow on the deployed URL. Retain the complete prior release outside the web runtime for recovery; a rollback is another synchronized publication with a new version, not a hand-edited cache name.

Both root and project deployments need a trailing-slash directory entry, normal static file serving, JavaScript/CSS/JSON/image MIME types, HTTPS, and real missing-path 404 responses. **Do not use SPA rewrites that return `index.html` with status 200 for every URL.** Serve the worker from the deployment root and do not broaden its scope with a header. Hosts should allow worker/version revalidation rather than applying immutable caching to mutable filenames.

GitHub Pages uses the deployment's root `404.html` for custom errors. Its configured absolute base handles arbitrarily nested missing URLs even without JavaScript. The inline fallback bootstrap reuses the configured path on a preview origin, and controlled fallback responses use the worker's actual base. For a first uncontrolled fallback page or nested 404 on a different local mounting path, use matching configuration or a server that supplies the correct base; a generic unknown nested URL cannot reveal its deployment root by itself.

On Apache, preserve `Options -Indexes`. Configure a **local-path** error document for the actual mount, for example `ErrorDocument 404 /404.html` at the origin root or `ErrorDocument 404 /aneesatariq/404.html` for that subpath. Do not use an external redirect as the error document, which loses the original 404 semantics. No universal absolute error path is hard-coded in `.htaccess` because it would break another deployment path. Opening `404.html` or `offline.html` directly on an uncontrolled static server may return 200; it is the server error handler or worker that supplies 404/503 on failures.

Crawlers honor **only origin-root `/robots.txt`**. A project's `portfolio/robots.txt` is a generated reference, not an origin crawler policy. The owner of the origin root must publish a suitable robots policy/sitemap reference or submit the project sitemap directly to search tools. Sitemap/canonical URLs are generated from the configured production URL.

## Verification record — local acceptance completed

Observed on 2026-11-21 with Node.js 22.21.0, Playwright 1.57.0, Chrome 158.0.8127.36, Edge 157.0.4341.60, and Lighthouse 13.6.0. Synchronization, syntax checks, and all **9 invariant tests passed**. All **19 real-browser acceptance groups passed in both Chrome and Edge** after the final corrections. The synchronized publication precaches **29 resources / 1,740,467 decoded bytes**, below its 2,000,000-byte ceiling. No hosting build, commit, push, deployment, or native app installation was performed.

### Reproduce automated checks

Run from the repository directory:

```powershell
node assets/scripts/sync-content.mjs --check
node --check sw.js
Get-ChildItem assets/scripts/*.mjs | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE) { throw "Script syntax check failed" } }
Get-ChildItem assets/js/*.js | ForEach-Object { node --experimental-default-type=module --check $_.FullName; if ($LASTEXITCODE) { throw "Module syntax check failed" } }
node --test assets/scripts/pwa-invariants.test.mjs
```

The invariant source checks deterministic snapshots, payload hashes/budget, version-only token changes, atomic-batch intent and failed-install rejection, root/subpath routing, status distinctions, bypass behavior, explicit activation, old-tab pinning, and cleanup with newer installing/waiting workers. It mocks the lifecycle; the separate browser harness exercises actual service workers, Cache API transactions, and native resource-integrity enforcement.

If Playwright is already resolvable as a Node package, run `node assets/scripts/browser-acceptance.test.mjs`. Otherwise point `PLAYWRIGHT_MODULE` at an existing installation's absolute `playwright/index.mjs` path. No dependency is added to the website:

```powershell
$env:PLAYWRIGHT_MODULE = 'C:\path\to\node_modules\playwright\index.mjs'
$env:BROWSER_CHANNEL = 'chrome'
node assets/scripts/browser-acceptance.test.mjs
$env:BROWSER_CHANNEL = 'msedge'
node assets/scripts/browser-acceptance.test.mjs
```

The harness creates loopback servers and root/subpath/version/fault releases in memory, leaves the real release version unchanged, returns nonzero on failed acceptance, and closes its own browser contexts and servers. `BROWSER_SCREENSHOTS=1` optionally writes `verification-375.png` and `verification-1440.png`; `BROWSER_LIFECYCLE_TRACE=1` adds fixture-only lifecycle diagnostics. These are optional diagnostic outputs, not publication resources.

### Observed coverage and corrections

- [x] Exact 320/375/768/1024/1440 CSS-pixel viewports, no horizontal overflow, loaded portraits, reduced motion, and 720-CSS-pixel reflow equivalent to a halved desktop viewport. Full-page mobile/desktop screenshots were inspected. Actual browser 200% zoom is not claimed.
- [x] Mobile menu/Escape/anchor focus, all portfolio/tool filters, dialog Tab/Shift+Tab containment and content/focus restoration, manual clipboard fallback, required/maximum-length composer validation, and honest unsent `mailto:` feedback.
- [x] Fresh no-JavaScript content: all eight sections, portfolio/tool item counts, native details, visible navigation, contact link, and nested custom-404 status/configured base in an isolated fixture.
- [x] Delayed desktop-only welcome, blocked-storage fallback, no focus theft, form/dialog suppression, offline dismissal, and update priority without competing welcome notices.
- [x] Root/subpath manifest scope, icon dimensions, every mandatory cached resource's SHA-256/byte count, both portrait formats and all candidate families, offline home navigation/images, online nested 404 and offline nested 503 statuses/bases.
- [x] Network-only unknown APIs, POSTs, other origins, neighboring paths, fresh-version bypass, version-only waiting update, deferral, explicit acceptance, one-tab reload, old-tab draft/release retention, and draft-change reload suppression.
- [x] Actual missing/modified/redirected resource installation rejection without partial entries or damage to the old release; natural scoped cleanup after tabs close, neighboring-cache retention, and cache-eviction fail-closed 503 behavior.
- [x] Install/help guidance and synthetic explicit-prompt dismissal, `appinstalled`, standalone, insecure-context, and registration-error paths. These simulations are not genuine device installation tests.
- [x] No unexpected JavaScript runtime errors in the UI acceptance fixture. Intentional network/install/eviction failures are expected in fault fixtures.

Confirmed defects corrected: initial installation incorrectly showing an update notice; forward Tab escaping from the initially focused dialog heading; delayed activation deleting a newer pending worker's cache; a maskable-icon reference to a missing asset; and brand text/accessible-name mismatch, including missing whitespace between adjacent text spans. Regression coverage protects lifecycle cleanup, initial installation, dialog focus, cached media integrity, and brand labeling.

### Measured Lighthouse results

Final audits used the synchronized site at `http://127.0.0.1:8080/` with headless Chrome, default mobile simulation and the desktop preset. Scores in Performance / Accessibility / Best Practices / SEO order: **mobile 96 / 100 / 100 / 100; desktop 100 / 100 / 100 / 100**. Both exceed the requested 90+ Performance and 95+ other-category targets. The visible-label/accessible-name audit also passes. Automated accessibility scores do not establish complete assistive-technology compatibility.

Remaining optimization advisories include mobile CLS approximately 0.124, unminified authored assets, and potential responsive-image savings. These did not prevent the targets from passing; no host-side byte transformations or new build pipeline were introduced. Loopback's secure-context treatment does not establish deployed HTTPS configuration.

To repeat with optional Lighthouse tooling, start the root server described above, then run:

```powershell
npx.cmd --yes lighthouse http://127.0.0.1:8080/ --output=json --output-path=./.verification-lighthouse.json --chrome-flags="--headless --no-first-run" --no-enable-error-reporting --quiet
npx.cmd --yes lighthouse http://127.0.0.1:8080/ --preset=desktop --output=json --output-path=./.verification-lighthouse-desktop.json --chrome-flags="--headless --no-first-run" --no-enable-error-reporting --quiet
node assets/scripts/browser-acceptance.test.mjs --lighthouse-report .verification-lighthouse.json
node assets/scripts/browser-acceptance.test.mjs --lighthouse-report .verification-lighthouse-desktop.json
```

`npx.cmd` may obtain optional Lighthouse tooling; it does not add site dependencies. Configure `CHROME_PATH` if Chrome is not discoverable. Scores vary with machine load. Temporary Lighthouse reports and screenshots were removed after recording these results, and the session-owned port-8080 preview was stopped. The preexisting port-8000 server was left untouched.

### Remaining owner/device acceptance

- [ ] Verify actual Safari/iOS and Android devices, genuine native installation/dismissal/standalone/offline behavior, browser 200% zoom, and assistive technologies. Those platforms/actions were unavailable or not exercised locally; simulated user agents/events are not substitutes.
- [ ] Confirm the intended final production URL, supplied personal-content accuracy, and publication authorization before publishing a coherent synchronized release.
- [ ] After separately authorized deployment, verify HTTPS, MIME types, first-visit/no-JavaScript custom-404 links/status, root or project mounting, manifest/install eligibility, worker/version revalidation, and old-to-new multi-tab updates on the actual host.
- [ ] If desired, verify handoff to the intended external mail application. No message was sent and the website has no sending backend.

## License

The existing `LICENSE` is preserved. Confirm authorization before replacing or republishing personal photography or third-party materials.
