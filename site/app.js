import { openVersionedStore } from './storage.js';
import { createVisitorController, createRegexResultDispatcher, interceptLockedActivation, styleFunnyCopy } from './controllers.mjs';

export const FEATURE_IDS = [
  'language-modes', 'dialog-emoji-toggle', 'school-mode', 'narration', 'scheduled-settings',
  'dim-sum-surprise', 'regex-builders', 'notification-centre', 'appearance-editors',
  'tabbed-navigation', 'offline-documentation', 'command-palette', 'destructive-confirmation',
  'local-history', 'changelog-viewer', 'external-editor', 'exports', 'bulk-actions',
  'accessibility-responsive-sizing', 'personal-vocabulary-upload', 'toy-locks-authentication',
  'unlock-ladder', 'shared-link-embed', 'adhd-modes', 'browser-download-surfaces',
  'app-logo-customization', 'file-converter', 'ollama-suite-manager', 'status-hub', 'front-screen-provenance'
];

const FEATURE_TITLES = {
  'language-modes': 'Language modes', 'dialog-emoji-toggle': 'Dialog emoji toggle', 'school-mode': 'School mode',
  narration: 'Narration', 'scheduled-settings': 'Scheduled settings', 'dim-sum-surprise': 'Dim sum surprise',
  'regex-builders': 'Regex builders', 'notification-centre': 'Notification centre', 'appearance-editors': 'Appearance editors',
  'tabbed-navigation': 'Tabbed navigation', 'offline-documentation': 'Offline documentation', 'command-palette': 'Command palette',
  'destructive-confirmation': 'Destructive confirmation', 'local-history': 'Local history', 'changelog-viewer': 'Changelog viewer',
  'external-editor': 'External editor', exports: 'Exports', 'bulk-actions': 'Bulk actions',
  'accessibility-responsive-sizing': 'Accessibility and responsive sizing', 'personal-vocabulary-upload': 'Personal vocabulary upload',
  'toy-locks-authentication': 'Toy locks and authentication', 'unlock-ladder': 'Unlock ladder', 'shared-link-embed': 'Shared-link embed',
  'adhd-modes': 'ADHD modes', 'browser-download-surfaces': 'Browser download surfaces', 'app-logo-customization': 'App-logo customization',
  'file-converter': 'File converter', 'ollama-suite-manager': 'Ollama suite manager', 'status-hub': 'Status Hub',
  'front-screen-provenance': 'Front-screen provenance'
};

const FEATURE_SUMMARIES = {
  'language-modes': 'English, playful Hong Kong Cantonese, and compact bilingual copy are selectable per visitor.',
  'dialog-emoji-toggle': 'Dialog decoration is controlled separately from factual copy and accessibility names.',
  'school-mode': 'A shared local mode can simplify presentation and restore previous preferences after unlock.',
  narration: 'Optional local text-to-speech supports English, Cantonese, and serialized bilingual narration.',
  'scheduled-settings': 'Local schedules can apply language, theme, density, typography, and other appearance values.',
  'dim-sum-surprise': 'A small local delight may appear at startup without delaying or blocking the page.',
  'regex-builders': 'Every search field has an adjacent, bounded advanced regular-expression workbench.',
  'notification-centre': 'Information and progress use non-blocking notifications with a reviewable history.',
  'appearance-editors': 'Per-element appearance editing keeps state, accessibility, and reset paths explicit.',
  'tabbed-navigation': 'Content is separated into browser-style tabs with responsive navigation.',
  'offline-documentation': 'Feature articles are intended to be bundled for offline reading.',
  'command-palette': 'Ctrl+Shift+F opens a searchable palette that can focus the exact destination.',
  'destructive-confirmation': 'Irreversible actions require two independent keys and a full-range confirmation slider.',
  'local-history': 'User-managed changes are recorded locally with append-only, redacted history metadata.',
  'changelog-viewer': 'Released versions, dates, categories, and source commits remain searchable and exportable.',
  'external-editor': 'Detected editors can open an exported file or project folder, with VS Code as the required path.',
  exports: 'Owned records are exportable in faithful structured and text formats with loss disclosed.',
  'bulk-actions': 'Lists support selection, preview, progress, cancellation, undo, and honest partial outcomes.',
  'accessibility-responsive-sizing': 'Keyboard, screen-reader, contrast, reduced-motion, and narrow layouts are first-class.',
  'personal-vocabulary-upload': 'A local, validated JSON upload can customize private wording without network access.',
  'toy-locks-authentication': 'Opt-in per-element locks are a reversible user-experience speed bump, not security.',
  'unlock-ladder': 'A bounded set of small diversions can shorten a lockout wait without changing authentication.',
  'shared-link-embed': 'Pages carry product-specific Open Graph metadata and a verified image when published.',
  'adhd-modes': 'Five independent attention-support modes remain off by default and preserve user agency.',
  'browser-download-surfaces': 'The extension flow exposes start, progress, and completion as separate honest states.',
  'app-logo-customization': 'Local presets and bounded custom-image processing change presentation only.',
  'file-converter': 'A categorized local converter catalog makes bundled and unavailable formats explicit.',
  'ollama-suite-manager': 'A local model catalog and chat surface uses the documented local HTTP API only.',
  'status-hub': 'A live status view records current state, evidence, next checks, and unverified work.',
  'front-screen-provenance': 'The first screen binds the running version and updated-at status to release provenance.'
};

const state = {
  language: localStorage.getItem('cdd.language') || 'en',
  theme: localStorage.getItem('cdd.theme') || 'light',
  emojis: localStorage.getItem('cdd.emojis') !== 'false',
  funnyEnglish: Number(localStorage.getItem('cdd.funnyEnglish') || 5),
  funnyCantonese: Number(localStorage.getItem('cdd.funnyCantonese') || 5),
  route: location.hash.slice(1) || 'home',
  logo: localStorage.getItem('cdd.logo') || 'star',
  customLogo: localStorage.getItem('cdd.customLogo') || ''
};

export const visitorStore = openVersionedStore('claude-design-desktop-site', 1);

const routes = [
  ['home', '⌂', 'Home'], ['features', '✦', 'Features'], ['documentation', '▤', 'Documentation'],
  ['status', '●', 'Status'], ['settings', '⚙', 'Settings'], ['downloads', '⇩', 'Downloads'], ['changelog', '◷', 'Changelog']
];

const DEFAULT_TABS = routes => routes.map(([id, , label]) => ({ id, label, pinned: false, groupId: null }));
export const visitorController = createVisitorController(visitorStore, { tabs: DEFAULT_TABS(routes) });
async function hydrateLargeState() { const saved = await visitorStore.get('workspace'); if (saved?.tabs?.length) visitorController.state.tabs = saved.tabs; if (Array.isArray(saved?.tabGroups)) visitorController.state.groups = saved.tabGroups; if (saved?.locks && typeof saved.locks === 'object') visitorController.state.locks = saved.locks; renderTabs(); syncDomLocks(); }
function syncDomLocks() { document.querySelectorAll('[data-context-target]').forEach((element) => { const lock = visitorController.state.locks[element.dataset.contextTarget]; if (lock?.locked) { element.dataset.locked = 'true'; element.setAttribute('aria-disabled', 'true'); } else { delete element.dataset.locked; element.removeAttribute('aria-disabled'); } }); }

const save = (key, value) => localStorage.setItem(`cdd.${key}`, String(value));
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const bilingual = (en, zh) => state.language === 'bilingual' ? `${en}<span class="secondary-copy">${zh}</span>` : state.language === 'zh' ? zh : en;
const funny = (en, zh) => styleFunnyCopy(en, zh, { english: state.funnyEnglish, cantonese: state.funnyCantonese }, state.language === 'zh' ? 'zh' : state.language === 'bilingual' ? 'bilingual' : 'en');

function searchControl(id, label, placeholder = 'Search this surface') {
  return `<div class="search-row" data-search-surface="${id}"><label class="sr-only" for="${id}">${escapeHtml(label)}</label><input id="${id}" type="search" placeholder="${escapeHtml(placeholder)}" autocomplete="off" /><button class="regex-button" data-regex-for="${id}" type="button">.* Regex</button></div>`;
}

function shell(content, title, intro = '') {
  return `<section class="page" data-context-target="${state.route}"><div class="page-header"><div><span class="eyebrow">Claude Design Desktop</span><h1>${title}</h1>${intro ? `<p class="lede">${intro}</p>` : ''}</div></div>${content}</section>`;
}

function renderHome() {
  return shell(`<div class="card hero-card"><span class="eyebrow">Local-first design workspace</span><h2>Build, inspect, and document design work.</h2><p>${funny('This public landing site explains the product. The installed app remains the runtime.', '呢個公開頁面用嚟介紹產品，真正運行要用已安裝嘅應用程式。')}</p><div class="button-row"><button class="filled-button" data-route="features" type="button">Explore features</button><button class="outlined-button" data-route="documentation" type="button">Read documentation</button></div></div><div class="card"><h2>Provenance at a glance</h2><dl class="metadata"><div><dt>Running version</dt><dd id="version-value">Loading…</dd></div><div><dt>Updated at</dt><dd id="updated-value">Loading…</dd></div><div><dt>Source baseline</dt><dd><code>4a3c267e</code></dd></div><div><dt>Release state</dt><dd>Preview, not verified</dd></div></dl><p id="provenance-note" class="inline-status">The release timestamp is unavailable until build provenance is recorded. No launch time is substituted.</p></div><div class="card-grid"><div class="card status-card"><span class="status-dot pending"></span><div><h3>Current status</h3><p>Documentation surface in progress. Feature implementation and release evidence remain unverified until integration.</p></div></div><div class="card"><h3>Start with a real empty state</h3><p>No sample projects or fake account data are seeded here. Read the contracts, then use the installed application when a verified build is available.</p></div></div>`, 'A calmer home for design work', 'Documentation, status, and download evidence stay in one responsive surface.');
}

function renderFeatures() {
  return shell(`<div class="card">${searchControl('features-search', 'Search canonical features', 'Search all 30 canonical feature IDs')}<p class="supporting">Each row is a contract boundary. “Unverified” means the implementation and built evidence still need to be checked in the integrated application.</p><div id="feature-list" class="feature-list">${FEATURE_IDS.map(featureRow).join('')}</div></div>`, 'Feature contracts', 'The catalog is hand-written so a missing feature cannot disappear from discovery.');
}

function featureRow(id) {
  return `<article class="feature-row" data-feature="${id}" data-context-target="feature-${id}"><span class="feature-id">${id}</span><div><h3>${FEATURE_TITLES[id]}</h3><p>${FEATURE_SUMMARIES[id]}</p><button class="text-button open-article" data-article="${id}" type="button">Read bundled article <span class="sr-only">for ${FEATURE_TITLES[id]}</span></button><details class="feature-contract"><summary>Implementation and evidence status</summary><dl class="contract-grid"><dt>Implementation</dt><dd>Pending integrated runtime</dd><dt>Localized copy</dt><dd>English, Hong Kong Cantonese, and bilingual copy declared</dd><dt>Persistence</dt><dd>Pending runtime storage binding</dd><dt>Focused check</dt><dd><code>site/test-behavior.mjs</code></dd><dt>Built evidence</dt><dd>Pending real built-artifact interaction and screen capture</dd><dt>Negative regression</dt><dd>Inventory removal must fail the static and behavior checks</dd></dl></details></div><span class="feature-state">Unverified</span></article>`;
}

function renderDocumentation() {
  return shell(`<div class="card"><h2>Offline-ready article catalog</h2>${searchControl('docs-search', 'Search documentation', 'Search article titles and summaries')}<p class="supporting">The source articles below are the shared documentation bundle for the desktop application and this public landing site. Every article names behavior, configuration, failure modes, security considerations, verification, and suggested reading.</p><div id="docs-list" class="feature-list">${FEATURE_IDS.map((id) => `<article class="feature-row" data-doc="${id}"><span class="feature-id">docs/features/${id}.md</span><div><h3>${FEATURE_TITLES[id]}</h3><p>${FEATURE_SUMMARIES[id]}</p></div><button class="outlined-button open-article" data-article="${id}" type="button">Open bundled article</button></article>`).join('')}</div></div>`, 'Documentation', 'Read the source contracts before relying on a release claim.');
}

function renderArticle(id) {
  const title = FEATURE_TITLES[id] || 'Feature article';
  const summary = FEATURE_SUMMARIES[id] || 'This article is not present in the hand-written inventory.';
  return shell(`<div class="card article-card">${searchControl(`article-${id}-search`, `Search ${title}`, 'Search this article')}<p class="supporting">This bundled preview article is rendered locally from the checked-in documentation source. The integrated runtime must load the full Markdown article offline before release.</p><h2>${title}</h2><p>${summary}</p><h3>Behavior</h3><p>The feature contract is declared in <code>docs/features/${id}.md</code> and remains unverified until the integrated application exercises it.</p><h3>Configuration and persistence</h3><p>Configuration, local persistence, reset behavior, and browser-storage equivalents are documented in the source article. This preview does not invent runtime state.</p><h3>Failure and security</h3><p>Failures remain visible with recovery guidance. Credentials, private vocabulary content, and personal data stay outside the public article bundle.</p><h3>Verification</h3><p>Focused checks and real built-artifact evidence are pending integration. A static article presence check cannot prove runtime behavior.</p><h3>Suggested articles</h3><p><button class="text-button" data-route="documentation" type="button">Return to the article catalog</button></p></div>`, title, 'A local article view for the selected feature contract.');
}

function renderStatus() {
  return shell(`<div class="card"><h2>Live delivery status</h2>${searchControl('status-search', 'Search status', 'Search lanes and evidence')}<div class="card-grid"><div class="card status-card"><span class="status-dot pending"></span><div><h3>Site/docs lane</h3><p>Running in a task-owned lane. Static source is being assembled; integration has not happened.</p><small>Evidence: current source commit, no release URL asserted.</small></div></div><div class="card status-card"><span class="status-dot pending"></span><div><h3>Desktop runtime</h3><p>Pending other lanes. No installed artifact or account seam is claimed here.</p><small>Evidence: not available in this lane.</small></div></div><div class="card status-card"><span class="status-dot pending"></span><div><h3>Public release</h3><p>No verified installer is published, so the download control stays intentionally unavailable.</p><small>Evidence: release manifest not present.</small></div></div></div></div><div class="card"><h2>Evidence boundary</h2><p>This page is an interactive local status view. It does not claim a remote Status Hub delivery until integration supplies a verified endpoint. A pending item remains pending, even when the card looks tidy.</p></div>`, 'Status', 'A factual view of what is known, what is running, and what still needs proof.');
}

function renderSettings() {
  return shell(`<div class="card"><h2>${bilingual('Visitor settings', '訪客設定')}</h2>${searchControl('settings-search', 'Search settings', 'Search settings on this surface')}<div class="setting-list"><div class="setting"><div class="setting-header"><label for="language">${bilingual('Language mode', '語言模式')}</label><select id="language"><option value="en">English</option><option value="zh">Hong Kong Cantonese</option><option value="bilingual">Bilingual</option></select></div><p id="language-note" class="supporting">${bilingual('The selection applies locally to this public landing site and is persisted in browser storage.', '選擇只會儲存喺呢個公開頁面嘅瀏覽器資料。')}</p></div><div class="setting"><div class="setting-header"><label for="emoji-toggle">${bilingual('Show emojis in dialogs and message boxes', '喺對話框同訊息盒顯示表情符號')}</label><button id="emoji-toggle" class="toggle" type="button" aria-pressed="${state.emojis}" aria-label="Show emojis in dialogs and message boxes"></button></div><p id="emoji-note" class="supporting">${bilingual('Emoji decoration never replaces button labels, field labels, or accessible names.', '表情符號只係裝飾，唔會取代按鈕、欄位或者輔助科技名稱。')}</p></div><div class="setting"><label for="funny-en">English funny level: <output id="funny-en-value">${state.funnyEnglish}</output>/5</label><input id="funny-en" type="range" min="1" max="5" step="1" value="${state.funnyEnglish}" /><p class="supporting">Styles surrounding copy only. Facts, warnings, and options stay exact.</p></div><div class="setting"><label for="funny-zh">Cantonese funny level: <output id="funny-zh-value">${state.funnyCantonese}</output>/5</label><input id="funny-zh" type="range" min="1" max="5" step="1" value="${state.funnyCantonese}" /><p class="supporting">Styles Cantonese copy independently and persists it locally.</p></div><div class="setting"><div class="setting"><h3>${bilingual('Live copy preview', '即時文字預覽')}</h3><p id="funny-preview">${funny('Status updates stay precise.', '狀態更新保持準確。')}</p><p class="supporting">Both language controls change this preview independently.</p></div><div class="setting"><div class="setting-header"><label for="logo-upload">App-logo customization</label><span class="logo-preview" id="logo-preview" aria-label="Current local logo preview">✦</span></div><div class="button-row"><button class="outlined-button logo-choice" data-logo="star" type="button">Star preset</button><button class="outlined-button logo-choice" data-logo="orbit" type="button">Orbit preset</button><button class="outlined-button logo-choice" data-logo="grid" type="button">Grid preset</button></div><label for="logo-upload">Choose a local custom image<input id="logo-upload" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" /></label><p id="logo-status" class="supporting">No custom logo selected. Presets change presentation only and never change installed identity.</p><button id="reset-settings" class="text-button" type="button">Reset visitor settings</button></div></div></div><div class="card"><h2>Surface tabs</h2><p>Tab order and the left-side default are part of the documented contract. This public source keeps the narrow layout responsive by turning the rail into a horizontal strip below 720px.</p><div class="button-row"><button class="outlined-button" id="pin-current-tab" type="button">Pin current tab</button><button class="outlined-button" id="manage-tabs" type="button">Manage tab groups</button></div></div>`, 'Settings', 'Controls are local, persisted, and explicit about their boundaries.');
}

function renderDownloads() {
  return shell(`<div class="card"><h2>Downloads</h2>${searchControl('downloads-search', 'Search downloads', 'Search available releases')}<div class="empty-state"><h3>No verified installer is available yet</h3><p>The direct download button will appear only after a published release manifest proves the immutable asset URL, version, platform, and hash. This page will not guess a candidate URL.</p><button class="outlined-button" type="button" disabled title="A verified public release is required">Download Windows installer</button></div></div><div class="card"><h2>Browser companion</h2><p>The extension flow will be documented here with separate start, downloading, and completion surfaces. CRX signing is not part of this project policy; the supported path is an unpacked extension or ZIP.</p></div>`, 'Downloads', 'Verified release assets appear here only after publication evidence exists.');
}

function renderChangelog() {
  return shell(`<div class="card"><h2>Changelog</h2>${searchControl('changelog-search', 'Search changelog', 'Search released versions and changes')}<div class="empty-state"><h3>No released versions recorded in this preview source</h3><p>Entries will include exact version, release date, categorized changes, and a link to the completing commit. No dates or fixes are invented to fill the gap.</p></div></div>`, 'Changelog', 'A traceable release history will be rendered here once releases exist.');
}

function renderRoute() {
  const articleMatch = state.route.match(/^article:(.+)$/);
  const content = articleMatch ? () => renderArticle(articleMatch[1]) : ({ home: renderHome, features: renderFeatures, documentation: renderDocumentation, status: renderStatus, settings: renderSettings, downloads: renderDownloads, changelog: renderChangelog }[state.route] || renderHome);
  document.querySelector('#main-content').innerHTML = content();
  bindRouteActions();
  bindSearches();
  hydrateSettings();
  syncDomLocks();
  loadProvenance();
}

function renderTabs() {
  const tabs = visitorController.state.tabs.length ? visitorController.state.tabs : DEFAULT_TABS(routes);
  document.querySelector('#tab-list').innerHTML = tabs.map((tab) => { const route = routes.find(([id]) => id === tab.id); const icon = route?.[1] || '□'; const label = tab.label || route?.[2] || tab.id; const group = visitorController.state.groups.find((entry) => entry.id === tab.groupId); const destination = route?.[0] || 'home'; return `<button class="tab-button" role="tab" aria-selected="${state.route === destination}" data-route="${destination}" data-context-target="tab-${tab.id}" data-tab-id="${tab.id}"><span aria-hidden="true">${icon}</span><span>${escapeHtml(label)}</span>${group ? `<small class="tab-group-label">${escapeHtml(group.label)}</small>` : ''}${tab.pinned ? '<span class="tab-pin" aria-label="Pinned tab">●</span>' : ''}</button>`; }).join('');
  document.querySelectorAll('[data-route]').forEach((button) => button.addEventListener('click', () => { state.route = button.dataset.route; location.hash = state.route; renderTabs(); renderRoute(); }));
}

function bindRouteActions() {
  document.querySelectorAll('[data-route]').forEach((button) => button.addEventListener('click', () => { state.route = button.dataset.route; location.hash = state.route; renderTabs(); renderRoute(); }));
  document.querySelectorAll('.open-article').forEach((button) => button.addEventListener('click', () => { state.route = `article:${button.dataset.article}`; location.hash = state.route; renderTabs(); renderRoute(); }));
  document.querySelector('#open-settings')?.addEventListener('click', () => { state.route = 'settings'; location.hash = state.route; renderTabs(); renderRoute(); });
}

function bindSearches() {
  document.querySelectorAll('.search-row input').forEach((input) => input.addEventListener('input', () => {
    regexState.delete(input.id);
    dispatchSearch(input.id);
  }));
  document.querySelectorAll('.search-row input').forEach((input) => input.addEventListener('change', () => {
    dispatchSearch(input.id);
  }));
  /* The originating search owns its query and scope, never a shared global filter. */
  document.querySelectorAll('.search-row input').forEach((input) => {
    input.dataset.searchBound = 'true';
  });
  /* Regex buttons are bound below after their target field exists. */
  document.querySelectorAll('.regex-button').forEach((button) => button.addEventListener('click', () => openRegex(button.dataset.regexFor)));
}

function dispatchSearch(inputId) {
  const input = document.querySelector(`#${CSS.escape(inputId)}`);
  if (!input) return;
  const surface = input.closest('[data-search-surface]');
  if (!surface) return;
  const stateForInput = regexState.get(inputId);
  const query = input.value.trim();
  const scope = surface.dataset.searchSurface === 'features-search' ? '#feature-list [data-feature]' : surface.dataset.searchSurface === 'docs-search' ? '#docs-list [data-doc]' : surface.dataset.searchSurface === 'context-menu' ? 'button[data-context-action]' : null;
  const rows = scope ? surface.querySelectorAll(scope) : surface.closest('.card')?.querySelectorAll('.status-card, .setting, .empty-state, .feature-row');
  const rowValues = [...rows || []].map((row) => row.textContent);
  if (stateForInput?.mode === 'regex' && stateForInput.valid) { const request = regexDispatcher.nextRequest(); runBoundedRegex(stateForInput.pattern, stateForInput.flags, rowValues, request).then((result) => { if (!regexDispatcher.apply([...rows || []], result.matches, request)) return; surface.dataset.resultCount = String(result.matches.filter(Boolean).length); }).catch(() => { if (request !== regexDispatcher.currentRequest()) return; rows?.forEach((row) => { row.hidden = Boolean(query); }); surface.dataset.resultCount = '0'; }); } else { const matcher = (text) => text.toLocaleLowerCase().includes(query.toLocaleLowerCase()); rows?.forEach((row) => { row.hidden = Boolean(query && !matcher(row.textContent)); }); }
  surface.dataset.query = query;
  surface.dataset.mode = stateForInput?.mode || 'text';
  surface.dataset.resultCount = String([...rows || []].filter((row) => !row.hidden).length);
}

function hydrateSettings() {
  const language = document.querySelector('#language');
  if (language) { language.value = state.language; language.addEventListener('change', () => { state.language = language.value; save('language', state.language); renderRoute(); notify('Language updated', 'This visitor preference is stored locally.'); }); }
  const emoji = document.querySelector('#emoji-toggle');
  if (emoji) emoji.addEventListener('click', () => { state.emojis = !state.emojis; save('emojis', state.emojis); emoji.setAttribute('aria-pressed', state.emojis); notify(state.emojis ? 'Emoji decoration enabled' : 'Emoji decoration disabled', 'Factual copy and accessible names remain unchanged.'); });
  const en = document.querySelector('#funny-en');
  if (en) en.addEventListener('input', () => { state.funnyEnglish = Number(en.value); save('funnyEnglish', state.funnyEnglish); document.querySelector('#funny-en-value').value = state.funnyEnglish; document.querySelector('#funny-en-value').textContent = state.funnyEnglish; updateFunnyPreview(); });
  const zh = document.querySelector('#funny-zh');
  if (zh) zh.addEventListener('input', () => { state.funnyCantonese = Number(zh.value); save('funnyCantonese', state.funnyCantonese); document.querySelector('#funny-zh-value').value = state.funnyCantonese; document.querySelector('#funny-zh-value').textContent = state.funnyCantonese; updateFunnyPreview(); });
  document.querySelectorAll('.logo-choice').forEach((button) => button.addEventListener('click', () => { state.logo = button.dataset.logo; save('logo', state.logo); state.customLogo = ''; localStorage.removeItem('cdd.customLogo'); updateLogo(); notify('Logo preset applied', 'The selected mark changes presentation only.'); }));
  const upload = document.querySelector('#logo-upload');
  if (upload) upload.addEventListener('change', () => { const file = upload.files?.[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) { notify('Logo rejected', 'The local image exceeds the 2 MiB limit.'); upload.value = ''; return; } const reader = new FileReader(); reader.onload = () => { state.customLogo = String(reader.result); save('customLogo', state.customLogo); updateLogo(); notify('Local logo applied', 'The image stays in this browser profile.'); }; reader.readAsDataURL(file); });
  document.querySelector('#reset-settings')?.addEventListener('click', () => { Object.assign(state, { language: 'en', emojis: true, funnyEnglish: 5, funnyCantonese: 5, logo: 'star', customLogo: '' }); ['language', 'emojis', 'funnyEnglish', 'funnyCantonese', 'logo', 'customLogo'].forEach((key) => localStorage.removeItem(`cdd.${key}`)); renderRoute(); notify('Visitor settings reset', 'The original shipped wording and presentation are active again.'); });
  document.querySelector('#pin-current-tab')?.addEventListener('click', () => { const pinned = visitorController.togglePin(state.route); renderTabs(); notify(pinned ? 'Tab pinned' : 'Tab unpinned', 'The tab state is stored in the versioned local visitor store.'); });
  document.querySelector('#manage-tabs')?.addEventListener('click', () => { const group = visitorController.createGroup(); renderTabs(); notify('Tab group created', `${group.label} is stored in the versioned local visitor store.`); });
  updateLogo();
}

function updateFunnyPreview() { const preview = document.querySelector('#funny-preview'); if (preview) preview.innerHTML = funny('Status updates stay precise.', '狀態更新保持準確。'); }

function updateLogo() {
  const preview = document.querySelector('#logo-preview');
  if (!preview) return;
  preview.innerHTML = state.customLogo ? `<img src="${escapeHtml(state.customLogo)}" alt="Local custom logo preview" />` : state.logo === 'orbit' ? '◉' : state.logo === 'grid' ? '▦' : '✦';
  const status = document.querySelector('#logo-status');
  if (status) status.textContent = state.customLogo ? 'A validated local custom image is active. It is not uploaded or included in exports.' : 'No custom logo selected. Presets change presentation only and never change installed identity.';
}

async function loadProvenance() {
  const version = document.querySelector('#version-value');
  if (!version) return;
  try {
    const response = await fetch('./version.json', { cache: 'no-store' });
    const data = await response.json();
    version.textContent = data.version || 'Unavailable';
    const updated = document.querySelector('#updated-value');
    const note = document.querySelector('#provenance-note');
    if (data.updatedAt) { updated.textContent = `${data.updatedAt} (${data.timezone || 'UTC'})`; note.textContent = 'Updated-at is bound to build provenance from version.json.'; note.classList.add('verified'); } else { updated.textContent = 'Unavailable'; }
  } catch { version.textContent = 'Unavailable'; const updated = document.querySelector('#updated-value'); if (updated) updated.textContent = 'Unavailable'; }
}

function notify(title, body) {
  const root = document.querySelector('#notifications');
  const toast = document.createElement('div'); toast.className = 'toast'; toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span>`; root.appendChild(toast); setTimeout(() => toast.remove(), 6000);
}

let regexTarget = null;
const regexState = new Map();
const MAX_REGEX_PATTERN = 2048;
const MAX_REGEX_SAMPLE = 100000;
let regexWorker = null;
const regexDispatcher = createRegexResultDispatcher();
function runBoundedRegex(pattern, flags, samples, requestId) {
  if (typeof Worker === 'undefined') return Promise.reject(new Error('Regex mode is unavailable because a bounded worker is not supported.'));
  if (pattern.length > MAX_REGEX_PATTERN || samples.some((sample) => String(sample).length > MAX_REGEX_SAMPLE)) return Promise.reject(new Error('Regex input exceeds the local safety bound.'));
  regexWorker ||= new Worker('./regex-worker.js');
  const worker = regexWorker;
  return new Promise((resolve, reject) => { const id = requestId; const timer = setTimeout(() => { worker.terminate(); regexWorker = null; reject(new Error('Regex evaluation exceeded the bounded worker time.')); }, 120); const listener = (event) => { if (event.data?.id !== id) return; clearTimeout(timer); worker.removeEventListener('message', listener); event.data.ok ? resolve({ matches: event.data.results }) : reject(new Error(event.data.error)); }; worker.addEventListener('message', listener); worker.postMessage({ id, pattern, flags, samples }); });
}
function openRegex(target) {
  regexTarget = target || null;
  const saved = regexState.get(regexTarget) || { mode: 'text', pattern: target ? document.querySelector(`#${target}`)?.value || '' : '', flags: 'giu', valid: true };
  document.querySelector('#regex-mode').value = saved.mode;
  document.querySelector('#regex-pattern').value = saved.pattern;
  document.querySelector('#regex-flags').value = saved.flags;
  document.querySelector('#regex-dialog').showModal();
  evaluateRegex();
}
function evaluateRegex() {
  const pattern = document.querySelector('#regex-pattern').value.slice(0, MAX_REGEX_PATTERN);
  const flags = document.querySelector('#regex-flags').value;
  const mode = document.querySelector('#regex-mode').value;
  const sample = document.querySelector('#regex-sample').value.slice(0, MAX_REGEX_SAMPLE);
  const status = document.querySelector('#regex-validation');
  const explanation = document.querySelector('#regex-explanation');
  const matches = document.querySelector('#regex-matches');
  if (!pattern) { status.textContent = 'Enter a pattern to inspect matches.'; status.className = 'inline-status'; explanation.textContent = 'No pattern yet'; matches.textContent = '0'; if (regexTarget) regexState.set(regexTarget, { mode, pattern, flags, valid: false }); return; }
  if (mode === 'text') { try { const literal = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const expression = new RegExp(literal, flags); expression.lastIndex = 0; const found = [...sample.matchAll(expression)]; status.textContent = 'Plain text is valid and evaluated locally.'; status.className = 'inline-status verified'; explanation.textContent = `Literal search with ${pattern.length} characters`; matches.textContent = String(found.length); if (regexTarget) regexState.set(regexTarget, { mode, pattern, flags, valid: true }); } catch (error) { status.textContent = `Pattern is invalid: ${error.message}`; status.className = 'inline-status error'; explanation.textContent = 'No match evaluation'; matches.textContent = '0'; if (regexTarget) regexState.set(regexTarget, { mode, pattern, flags, valid: false }); } return; }
  if (typeof Worker === 'undefined') { status.textContent = 'Regex mode is unavailable because a bounded worker is not supported.'; status.className = 'inline-status error'; if (regexTarget) regexState.set(regexTarget, { mode, pattern, flags, valid: false }); return; }
  const request = regexDispatcher.nextRequest();
  runBoundedRegex(pattern, flags, [sample], request).then((result) => { if (request !== regexDispatcher.currentRequest()) return; status.textContent = 'Pattern is valid and evaluated in a bounded worker.'; status.className = 'inline-status verified'; explanation.textContent = `/${pattern}/${flags} with bounded worker evaluation`; matches.textContent = String(result.matches.filter(Boolean).length); if (regexTarget) regexState.set(regexTarget, { mode, pattern, flags, valid: true }); }).catch((error) => { if (request !== regexDispatcher.currentRequest()) return; status.textContent = `Pattern is invalid or exceeded the worker bound: ${error.message}`; status.className = 'inline-status error'; explanation.textContent = 'No match evaluation'; matches.textContent = '0'; if (regexTarget) regexState.set(regexTarget, { mode, pattern, flags, valid: false }); });
}

document.querySelector('#regex-pattern').addEventListener('input', evaluateRegex);
document.querySelector('#regex-flags').addEventListener('input', evaluateRegex);
document.querySelector('#regex-mode').addEventListener('change', evaluateRegex);
document.querySelector('#regex-sample').addEventListener('input', evaluateRegex);
document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => document.querySelector(`#${button.dataset.closeDialog}`).close()));
document.querySelector('#apply-regex').addEventListener('click', () => { if (regexTarget) { const mode = document.querySelector('#regex-mode').value; const pattern = document.querySelector('#regex-pattern').value.slice(0, MAX_REGEX_PATTERN); const flags = document.querySelector('#regex-flags').value; const current = regexState.get(regexTarget); if (!current?.valid) { document.querySelector('#regex-validation').textContent = 'Fix the pattern before applying it.'; return; } regexState.set(regexTarget, { mode, pattern, flags, valid: true }); const input = document.querySelector(`#${CSS.escape(regexTarget)}`); if (input) input.value = pattern; dispatchSearch(regexTarget); } document.querySelector('#regex-dialog').close(); });
document.querySelector('#open-palette').addEventListener('click', () => openPalette());
document.querySelector('#toggle-theme').addEventListener('click', () => { state.theme = state.theme === 'light' ? 'dark' : 'light'; save('theme', state.theme); document.documentElement.dataset.theme = state.theme; });
document.querySelector('#add-tab').addEventListener('click', () => { const id = visitorController.addTab('New tab'); renderTabs(); notify('New tab created', `${id} is stored in the versioned local visitor store.`); });

function openPalette() {
  const dialog = document.querySelector('#palette'); dialog.showModal(); const input = document.querySelector('#palette-search'); input.value = ''; input.focus(); renderPalette('');
}
function renderPalette(query) {
  const rows = [['home', 'Open Home', 'Destination'], ['features', 'Open feature contracts', 'Destination'], ['documentation', 'Open Documentation', 'Destination'], ['status', 'Open Status', 'Destination'], ['settings', 'Open visitor settings', 'Destination'], ['downloads', 'Open Downloads', 'Destination'], ['changelog', 'Open Changelog', 'Destination'], ...FEATURE_IDS.map((id) => [id, FEATURE_TITLES[id], 'Feature'])];
  const list = document.querySelector('#palette-results'); const filtered = rows.filter((row) => row[1].toLowerCase().includes(query.toLowerCase()) || row[0].toLowerCase().includes(query.toLowerCase()));
  list.innerHTML = filtered.length ? filtered.map(([id, label, kind]) => `<button class="palette-item" type="button" data-palette-route="${id}"><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(kind)} · ${escapeHtml(id)}</small></span><span aria-hidden="true">↗</span></button>`).join('') : '<div class="empty-state">No matching commands.</div>';
  list.querySelectorAll('[data-palette-route]').forEach((button) => button.addEventListener('click', () => { const target = button.dataset.paletteRoute; const destination = routes.some(([id]) => id === target) ? target : 'features'; state.route = destination; location.hash = destination; dialog.close(); renderTabs(); renderRoute(); requestAnimationFrame(() => { const exact = document.querySelector(`[data-feature="${CSS.escape(target)}"]`); exact?.scrollIntoView({ block: 'center' }); exact?.focus?.(); exact?.classList.add('palette-highlight'); setTimeout(() => exact?.classList.remove('palette-highlight'), 1200); }); notify('Palette destination opened', button.textContent.trim()); }));
}
document.querySelector('#palette-search').addEventListener('input', (event) => renderPalette(event.target.value));

document.addEventListener('contextmenu', (event) => { const target = event.target.closest('[data-context-target]'); if (!target) return; event.preventDefault(); document.querySelector('.context-menu')?.remove(); const menu = document.createElement('div'); menu.className = 'context-menu'; menu.dataset.searchSurface = 'context-menu'; menu.setAttribute('role', 'menu'); menu.innerHTML = `<label class="sr-only" for="context-filter">Filter context actions</label><div class="context-search"><input id="context-filter" type="search" placeholder="Filter actions" /><button class="regex-button" data-regex-for="context-filter" type="button">.* Regex</button></div><button type="button" data-context-action="appearance">Edit appearance…</button><button type="button" data-context-action="lock">Lock this element…</button><button type="button" data-context-action="copy">Copy accessible name</button>`; document.body.appendChild(menu); const x = Math.min(event.clientX, innerWidth - menu.offsetWidth - 12); const y = Math.min(event.clientY, innerHeight - menu.offsetHeight - 12); menu.style.left = `${Math.max(8, x)}px`; menu.style.top = `${Math.max(8, y)}px`; menu.querySelector('input').focus(); menu.querySelector('input').addEventListener('input', () => { regexState.delete('context-filter'); dispatchSearch('context-filter'); }); menu.querySelector('.regex-button').addEventListener('click', () => openRegex('context-filter')); menu.querySelectorAll('button[data-context-action]').forEach((button) => button.addEventListener('click', () => { if (button.dataset.contextAction === 'appearance') { state.route = 'settings'; location.hash = state.route; renderTabs(); renderRoute(); notify('Appearance editor', 'The settings surface is the documented place to adjust local presentation.'); } else if (button.dataset.contextAction === 'lock') { openLockDialog(target, { setup: true }); } else { navigator.clipboard?.writeText(target.textContent.trim()); notify('Accessible name copied', 'Only visible local text was requested.'); } menu.remove(); })); });
document.addEventListener('click', (event) => { if (!event.target.closest('.context-menu')) document.querySelector('.context-menu')?.remove(); });
let lockedTarget = null;
let lockSetup = false;
function openLockDialog(target, options = {}) { lockedTarget = target; lockSetup = Boolean(options.setup); const dialog = document.querySelector('#lock-dialog'); const name = target.dataset.contextTarget || target.textContent.trim().slice(0, 80) || 'element'; document.querySelector('#lock-title').textContent = lockSetup ? 'Configure element lock' : 'Unlock this element'; document.querySelector('#lock-target-name').textContent = lockSetup ? `Configure a browser-storage-only lock for “${name}”. It is a user-experience lock, not security or encryption.` : `The element “${name}” is locked locally. This is a user-experience lock, not security or encryption. Clear this site's storage to recover it.`; document.querySelector('#lock-policy-field').hidden = !lockSetup; document.querySelector('#lock-duration-field').hidden = !lockSetup; document.querySelector('#lock-confirm-field').hidden = !lockSetup; document.querySelector('#lock-value-label').textContent = lockSetup ? 'New phrase' : 'Unlock phrase'; document.querySelector('#unlock-element').textContent = lockSetup ? 'Save lock' : 'Unlock'; document.querySelector('#lock-value').value = ''; document.querySelector('#lock-confirm').value = ''; document.querySelector('#lock-status').textContent = lockSetup ? 'Choose a policy, duration, and phrase of at least four characters.' : 'Enter the configured phrase. Five failed attempts per minute are allowed.'; dialog.showModal(); document.querySelector('#lock-value').focus(); }
function guardActivation(event, eventType) { const target = event.target.closest?.('[data-context-target]'); if (!target) return; const decision = visitorController.dispatchAction(target.dataset.contextTarget, eventType); if (decision.kind === 'unlock-required' && interceptLockedActivation(target, event)) openLockDialog(target); }
document.addEventListener('click', (event) => guardActivation(event, 'click'), true);
document.addEventListener('touchstart', (event) => guardActivation(event, 'touchstart'), true);
document.addEventListener('keydown', (event) => { if (!['Enter', ' '].includes(event.key)) return; guardActivation(event, 'keydown'); }, true);
document.querySelector('#unlock-element').addEventListener('click', () => { const value = document.querySelector('#lock-value').value; if (!lockedTarget) return; const id = lockedTarget.dataset.contextTarget || 'unknown'; if (lockSetup) { const confirm = document.querySelector('#lock-confirm').value; if (value.length < 4 || value !== confirm) { document.querySelector('#lock-status').textContent = 'The phrase must be at least four characters and match the confirmation.'; return; } const policy = document.querySelector('#lock-policy').value; const durationMs = Number(document.querySelector('#lock-duration').value); if (!visitorController.lock(id, value, { policy, durationMs })) { document.querySelector('#lock-status').textContent = 'The browser-storage-only lock could not be saved.'; return; } lockedTarget.dataset.locked = 'true'; lockedTarget.setAttribute('aria-disabled', 'true'); lockedTarget.setAttribute('aria-label', `${lockedTarget.getAttribute('aria-label') || 'Element'} locked`); document.querySelector('#lock-dialog').close(); notify('Element lock enabled', 'Activation is intercepted until its configured verifier succeeds.'); } else { if (!visitorController.unlock(id, value)) { document.querySelector('#lock-status').textContent = 'The phrase did not match or the rate limit is active. No action was performed.'; return; } lockedTarget.dataset.locked = 'false'; lockedTarget.removeAttribute('aria-disabled'); lockedTarget.removeAttribute('aria-label'); document.querySelector('#lock-dialog').close(); notify('Element unlocked', 'The protected action is available again.'); lockedTarget.focus?.(); } lockedTarget = null; });
document.addEventListener('keydown', (event) => { if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); openPalette(); } if (event.key === 'Escape') document.querySelector('.context-menu')?.remove(); });
window.addEventListener('hashchange', () => { state.route = location.hash.slice(1) || 'home'; renderTabs(); renderRoute(); });

document.documentElement.dataset.theme = state.theme;
renderTabs();
renderRoute();
hydrateLargeState();
