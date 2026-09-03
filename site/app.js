import { openVersionedStore } from './storage.js';

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
  customLogo: localStorage.getItem('cdd.customLogo') || '',
  tabs: [],
  tabGroups: [],
  locks: {}
};

export const visitorStore = openVersionedStore('claude-design-desktop-site', 1);
const DEFAULT_TABS = routes => routes.map(([id, , label]) => ({ id, label, pinned: false, groupId: null }));
const saveLargeState = () => visitorStore.set('workspace', { tabs: state.tabs, tabGroups: state.tabGroups, locks: state.locks, updatedAt: new Date().toISOString() });
export function isLocked(target) { return Boolean(target?.closest?.('[data-locked="true"]')); }
export function interceptLockedActivation(target, event) { const locked = target?.closest?.('[data-locked="true"]'); if (!locked || event?.type === 'contextmenu') return false; event?.preventDefault?.(); event?.stopImmediatePropagation?.(); return true; }
export function toggleTabPin(tabId) { const tab = state.tabs.find((entry) => entry.id === tabId); if (!tab) return false; tab.pinned = !tab.pinned; saveLargeState(); return tab.pinned; }
export function createTabGroup(label = 'New group') { const group = { id: `group-${Date.now()}-${Math.random().toString(16).slice(2)}`, label, collapsed: false }; state.tabGroups.push(group); saveLargeState(); return group; }
export function addTab(label = 'New tab') { const id = `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`; state.tabs.push({ id, label, pinned: false, groupId: null }); saveLargeState(); return id; }
async function hydrateLargeState() { const saved = await visitorStore.get('workspace'); state.tabs = saved?.tabs?.length ? saved.tabs : DEFAULT_TABS(routes); state.tabGroups = Array.isArray(saved?.tabGroups) ? saved.tabGroups : []; state.locks = saved?.locks && typeof saved.locks === 'object' ? saved.locks : {}; renderTabs(); }

const routes = [
  ['home', '⌂', 'Home'], ['features', '✦', 'Features'], ['documentation', '▤', 'Documentation'],
  ['status', '●', 'Status'], ['settings', '⚙', 'Settings'], ['downloads', '⇩', 'Downloads'], ['changelog', '◷', 'Changelog']
];

const save = (key, value) => localStorage.setItem(`cdd.${key}`, String(value));
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const bilingual = (en, zh) => state.language === 'bilingual' ? `${en}<span class="secondary-copy">${zh}</span>` : state.language === 'zh' ? zh : en;
const funny = (en, zh) => bilingual(en, zh);

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
  return shell(`<div class="card"><h2>Visitor settings</h2>${searchControl('settings-search', 'Search settings', 'Search settings on this surface')}<div class="setting-list"><div class="setting"><div class="setting-header"><label for="language">Language mode</label><select id="language"><option value="en">English</option><option value="zh">Hong Kong Cantonese</option><option value="bilingual">Bilingual</option></select></div><p class="supporting">The selection applies locally to this public landing site and is persisted in browser storage.</p></div><div class="setting"><div class="setting-header"><label for="emoji-toggle">Show emojis in dialogs and message boxes</label><button id="emoji-toggle" class="toggle" type="button" aria-pressed="${state.emojis}" aria-label="Show emojis in dialogs and message boxes"></button></div><p class="supporting">Emoji decoration never replaces button labels, field labels, or accessible names.</p></div><div class="setting"><label for="funny-en">English funny level: <output id="funny-en-value">${state.funnyEnglish}</output>/5</label><input id="funny-en" type="range" min="1" max="5" step="1" value="${state.funnyEnglish}" /><p class="supporting">Styles surrounding copy only. Facts, warnings, and options stay exact.</p></div><div class="setting"><label for="funny-zh">Cantonese funny level: <output id="funny-zh-value">${state.funnyCantonese}</output>/5</label><input id="funny-zh" type="range" min="1" max="5" step="1" value="${state.funnyCantonese}" /><p class="supporting">Styles Cantonese copy independently and persists it locally.</p></div><div class="setting"><div class="setting-header"><label for="logo-upload">App-logo customization</label><span class="logo-preview" id="logo-preview" aria-label="Current local logo preview">✦</span></div><div class="button-row"><button class="outlined-button logo-choice" data-logo="star" type="button">Star preset</button><button class="outlined-button logo-choice" data-logo="orbit" type="button">Orbit preset</button><button class="outlined-button logo-choice" data-logo="grid" type="button">Grid preset</button></div><label for="logo-upload">Choose a local custom image<input id="logo-upload" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" /></label><p id="logo-status" class="supporting">No custom logo selected. Presets change presentation only and never change installed identity.</p><button id="reset-settings" class="text-button" type="button">Reset visitor settings</button></div></div></div><div class="card"><h2>Surface tabs</h2><p>Tab order and the left-side default are part of the documented contract. This public source keeps the narrow layout responsive by turning the rail into a horizontal strip below 720px.</p><div class="button-row"><button class="outlined-button" id="pin-current-tab" type="button">Pin current tab</button><button class="outlined-button" id="manage-tabs" type="button">Manage tab groups</button></div></div>`, 'Settings', 'Controls are local, persisted, and explicit about their boundaries.');
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
  loadProvenance();
}

function renderTabs() {
  const tabs = state.tabs.length ? state.tabs : DEFAULT_TABS(routes);
  document.querySelector('#tab-list').innerHTML = tabs.map((tab) => { const route = routes.find(([id]) => id === tab.id); const icon = route?.[1] || '□'; const label = tab.label || route?.[2] || tab.id; const group = state.tabGroups.find((entry) => entry.id === tab.groupId); const destination = route?.[0] || 'home'; return `<button class="tab-button" role="tab" aria-selected="${state.route === destination}" data-route="${destination}" data-context-target="tab-${tab.id}" data-tab-id="${tab.id}"><span aria-hidden="true">${icon}</span><span>${escapeHtml(label)}</span>${group ? `<small class="tab-group-label">${escapeHtml(group.label)}</small>` : ''}${tab.pinned ? '<span class="tab-pin" aria-label="Pinned tab">●</span>' : ''}</button>`; }).join('');
  document.querySelectorAll('[data-route]').forEach((button) => button.addEventListener('click', () => { state.route = button.dataset.route; location.hash = state.route; renderTabs(); renderRoute(); }));
}

function bindRouteActions() {
  document.querySelectorAll('[data-route]').forEach((button) => button.addEventListener('click', () => { state.route = button.dataset.route; location.hash = state.route; renderTabs(); renderRoute(); }));
  document.querySelectorAll('.open-article').forEach((button) => button.addEventListener('click', () => { state.route = `article:${button.dataset.article}`; location.hash = state.route; renderTabs(); renderRoute(); }));
  document.querySelector('#open-settings')?.addEventListener('click', () => { state.route = 'settings'; location.hash = state.route; renderTabs(); renderRoute(); });
}

function bindSearches() {
  document.querySelectorAll('.search-row input').forEach((input) => input.addEventListener('input', () => {
    const value = input.value.trim().toLowerCase();
    const surface = input.closest('[data-search-surface]');
    if (!surface) return;
    const scope = surface.dataset.searchSurface === 'features-search' ? '#feature-list [data-feature]' : surface.dataset.searchSurface === 'docs-search' ? '#docs-list [data-doc]' : null;
    const rows = scope ? document.querySelectorAll(scope) : surface.closest('.card')?.querySelectorAll('.status-card, .setting, .empty-state, .feature-row');
    rows?.forEach((row) => { row.hidden = Boolean(value && !row.textContent.toLowerCase().includes(value)); });
    if (surface.dataset.searchSurface?.includes('search')) surface.dataset.query = value;
  }));
  document.querySelectorAll('.regex-button').forEach((button) => button.addEventListener('click', () => openRegex(button.dataset.regexFor)));
}

function hydrateSettings() {
  const language = document.querySelector('#language');
  if (language) { language.value = state.language; language.addEventListener('change', () => { state.language = language.value; save('language', state.language); renderRoute(); notify('Language updated', 'This visitor preference is stored locally.'); }); }
  const emoji = document.querySelector('#emoji-toggle');
  if (emoji) emoji.addEventListener('click', () => { state.emojis = !state.emojis; save('emojis', state.emojis); emoji.setAttribute('aria-pressed', state.emojis); notify(state.emojis ? 'Emoji decoration enabled' : 'Emoji decoration disabled', 'Factual copy and accessible names remain unchanged.'); });
  const en = document.querySelector('#funny-en');
  if (en) en.addEventListener('input', () => { state.funnyEnglish = Number(en.value); save('funnyEnglish', state.funnyEnglish); document.querySelector('#funny-en-value').value = state.funnyEnglish; document.querySelector('#funny-en-value').textContent = state.funnyEnglish; });
  const zh = document.querySelector('#funny-zh');
  if (zh) zh.addEventListener('input', () => { state.funnyCantonese = Number(zh.value); save('funnyCantonese', state.funnyCantonese); document.querySelector('#funny-zh-value').value = state.funnyCantonese; document.querySelector('#funny-zh-value').textContent = state.funnyCantonese; });
  document.querySelectorAll('.logo-choice').forEach((button) => button.addEventListener('click', () => { state.logo = button.dataset.logo; save('logo', state.logo); state.customLogo = ''; localStorage.removeItem('cdd.customLogo'); updateLogo(); notify('Logo preset applied', 'The selected mark changes presentation only.'); }));
  const upload = document.querySelector('#logo-upload');
  if (upload) upload.addEventListener('change', () => { const file = upload.files?.[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) { notify('Logo rejected', 'The local image exceeds the 2 MiB limit.'); upload.value = ''; return; } const reader = new FileReader(); reader.onload = () => { state.customLogo = String(reader.result); save('customLogo', state.customLogo); updateLogo(); notify('Local logo applied', 'The image stays in this browser profile.'); }; reader.readAsDataURL(file); });
  document.querySelector('#reset-settings')?.addEventListener('click', () => { Object.assign(state, { language: 'en', emojis: true, funnyEnglish: 5, funnyCantonese: 5, logo: 'star', customLogo: '' }); ['language', 'emojis', 'funnyEnglish', 'funnyCantonese', 'logo', 'customLogo'].forEach((key) => localStorage.removeItem(`cdd.${key}`)); renderRoute(); notify('Visitor settings reset', 'The original shipped wording and presentation are active again.'); });
  document.querySelector('#pin-current-tab')?.addEventListener('click', () => { const pinned = toggleTabPin(state.route); renderTabs(); notify(pinned ? 'Tab pinned' : 'Tab unpinned', 'The tab state is stored in the versioned local visitor store.'); });
  document.querySelector('#manage-tabs')?.addEventListener('click', () => { const group = createTabGroup(); renderTabs(); notify('Tab group created', `${group.label} is stored in the versioned local visitor store.`); });
  updateLogo();
}

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
function openRegex(target) {
  regexTarget = target || null;
  const source = target ? document.querySelector(`#${target}`)?.value || '' : '';
  document.querySelector('#regex-pattern').value = source;
  document.querySelector('#regex-dialog').showModal();
  evaluateRegex();
}
function evaluateRegex() {
  const pattern = document.querySelector('#regex-pattern').value;
  const flags = document.querySelector('#regex-flags').value;
  const sample = document.querySelector('#regex-sample').value;
  const status = document.querySelector('#regex-validation');
  const explanation = document.querySelector('#regex-explanation');
  const matches = document.querySelector('#regex-matches');
  if (!pattern) { status.textContent = 'Enter a pattern to inspect matches.'; explanation.textContent = 'No pattern yet'; matches.textContent = '0'; return; }
  try { const expression = new RegExp(pattern, flags); const found = [...sample.matchAll(expression)]; status.textContent = 'Pattern is valid and evaluated locally.'; status.className = 'inline-status verified'; explanation.textContent = `/${pattern}/${flags} with ${expression.source.length} pattern characters`; matches.textContent = String(found.length); } catch (error) { status.textContent = `Pattern is invalid: ${error.message}`; status.className = 'inline-status error'; explanation.textContent = 'No match evaluation'; matches.textContent = '0'; }
}

document.querySelector('#regex-pattern').addEventListener('input', evaluateRegex);
document.querySelector('#regex-flags').addEventListener('input', evaluateRegex);
document.querySelector('#regex-sample').addEventListener('input', evaluateRegex);
document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => document.querySelector(`#${button.dataset.closeDialog}`).close()));
document.querySelector('#apply-regex').addEventListener('click', () => { if (regexTarget) { const input = document.querySelector(`#${regexTarget}`); if (input) input.value = document.querySelector('#regex-pattern').value; } document.querySelector('#regex-dialog').close(); });
document.querySelector('#open-palette').addEventListener('click', () => openPalette());
document.querySelector('#toggle-theme').addEventListener('click', () => { state.theme = state.theme === 'light' ? 'dark' : 'light'; save('theme', state.theme); document.documentElement.dataset.theme = state.theme; });
document.querySelector('#add-tab').addEventListener('click', () => { const id = addTab('New tab'); renderTabs(); notify('New tab created', `${id} is stored in the versioned local visitor store.`); });

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

document.addEventListener('contextmenu', (event) => { const target = event.target.closest('[data-context-target]'); if (!target) return; event.preventDefault(); document.querySelector('.context-menu')?.remove(); const menu = document.createElement('div'); menu.className = 'context-menu'; menu.setAttribute('role', 'menu'); menu.innerHTML = `<label class="sr-only" for="context-filter">Filter context actions</label><div class="context-search"><input id="context-filter" type="search" placeholder="Filter actions" /><button class="regex-button" data-regex-for="context-filter" type="button">.* Regex</button></div><button type="button" data-context-action="appearance">Edit appearance…</button><button type="button" data-context-action="lock">Lock this element…</button><button type="button" data-context-action="copy">Copy accessible name</button>`; document.body.appendChild(menu); const x = Math.min(event.clientX, innerWidth - menu.offsetWidth - 12); const y = Math.min(event.clientY, innerHeight - menu.offsetHeight - 12); menu.style.left = `${Math.max(8, x)}px`; menu.style.top = `${Math.max(8, y)}px`; menu.querySelector('input').focus(); menu.querySelector('input').addEventListener('input', (e) => menu.querySelectorAll('button[data-context-action]').forEach((button) => { button.hidden = !button.textContent.toLowerCase().includes(e.target.value.toLowerCase()); })); menu.querySelector('.regex-button').addEventListener('click', () => openRegex('context-filter')); menu.querySelectorAll('button[data-context-action]').forEach((button) => button.addEventListener('click', () => { if (button.dataset.contextAction === 'appearance') { state.route = 'settings'; location.hash = state.route; renderTabs(); renderRoute(); notify('Appearance editor', 'The settings surface is the documented place to adjust local presentation.'); } else if (button.dataset.contextAction === 'lock') { target.dataset.locked = 'true'; target.setAttribute('aria-disabled', 'true'); target.setAttribute('aria-label', `${target.getAttribute('aria-label') || 'Element'} locked`); state.locks[target.dataset.contextTarget || 'unknown'] = true; saveLargeState(); notify('Element lock enabled', 'This preview intercepts activation locally.'); } else { navigator.clipboard?.writeText(target.textContent.trim()); notify('Accessible name copied', 'Only visible local text was requested.'); } menu.remove(); })); });
document.addEventListener('click', (event) => { if (!event.target.closest('.context-menu')) document.querySelector('.context-menu')?.remove(); });
let lockedTarget = null;
function openLockDialog(target) { lockedTarget = target; const dialog = document.querySelector('#lock-dialog'); const name = target.dataset.contextTarget || target.textContent.trim().slice(0, 80) || 'element'; document.querySelector('#lock-target-name').textContent = `The element “${name}” is locked locally. This is a user-experience lock, not security or encryption. Clear this site's storage to recover it.`; document.querySelector('#lock-value').value = ''; document.querySelector('#lock-status').textContent = 'Enter the phrase configured for this element.'; dialog.showModal(); document.querySelector('#lock-value').focus(); }
document.addEventListener('click', (event) => { if (interceptLockedActivation(event.target, event)) openLockDialog(event.target.closest('[data-locked="true"]')); }, true);
document.addEventListener('keydown', (event) => { if (!['Enter', ' '].includes(event.key)) return; if (interceptLockedActivation(event.target, event)) openLockDialog(event.target.closest('[data-locked="true"]')); }, true);
document.querySelector('#unlock-element').addEventListener('click', () => { const value = document.querySelector('#lock-value').value; if (!value) { document.querySelector('#lock-status').textContent = 'A non-empty phrase is required; no action was performed.'; return; } if (!lockedTarget) return; lockedTarget.dataset.locked = 'false'; lockedTarget.removeAttribute('aria-disabled'); lockedTarget.removeAttribute('aria-label'); if (lockedTarget.dataset.contextTarget) delete state.locks[lockedTarget.dataset.contextTarget]; saveLargeState(); document.querySelector('#lock-dialog').close(); notify('Element unlocked', 'The protected action is available again.'); lockedTarget.focus?.(); lockedTarget = null; });
document.addEventListener('keydown', (event) => { if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); openPalette(); } if (event.key === 'Escape') document.querySelector('.context-menu')?.remove(); });
window.addEventListener('hashchange', () => { state.route = location.hash.slice(1) || 'home'; renderTabs(); renderRoute(); });

document.documentElement.dataset.theme = state.theme;
renderTabs();
renderRoute();
hydrateLargeState();
