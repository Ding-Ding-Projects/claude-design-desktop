const params = new URLSearchParams(window.location.search);
const requestedScreen = window.location.hostname;
const requestedState = params.get("state");
const requestedTheme = params.get("theme");
const requestedLocale = params.get("locale");
const expectedQueryKeys = ["state", "theme", "locale", "width", "height", "scale", "fixture", "time", "motion", "network"];
const supportedThemes = new Set(["light", "dark"]);
const supportedLocales = new Set(["en-US", "zh-Hant", "bilingual"]);
const supportedScales = new Set(["1", "1.25", "1.5", "2"]);
const supportedViewports = new Set(["1280x800", "960x700", "720x900"]);
const navIcons = { signin: "↗", accounts: "◎", projects: "▦", editor: "✎", sharing: "⇄", settings: "⚙", features: "✦", downloads: "↓", recovery: "!" };

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const localized = (english, cantonese) => requestedLocale === "zh-Hant" ? cantonese : requestedLocale === "bilingual" ? `${english} · ${cantonese}` : english;
const copyFor = (screen) => {
  if (requestedLocale === "zh-Hant") return screen.zh;
  if (requestedLocale === "bilingual") return { eyebrow: `${screen.en.eyebrow} · ${screen.zh.eyebrow}`, title: `${screen.en.title} · ${screen.zh.title}`, summary: `${screen.en.summary} ${screen.zh.summary}`, primary: `${screen.en.primary} · ${screen.zh.primary}`, secondary: `${screen.en.secondary} · ${screen.zh.secondary}` };
  return screen.en;
};

function assertRoute(data) {
  if (window.location.protocol !== "design-reference:") throw new Error("The reference must use the design-reference protocol");
  const screen = data.screens.find((item) => item.id === requestedScreen);
  if (!screen) throw new Error(`Unknown reference screen: ${requestedScreen}`);
  if (requestedState !== screen.state) throw new Error(`Unsupported state ${requestedState} for ${requestedScreen}`);
  if (!supportedThemes.has(requestedTheme)) throw new Error(`Unsupported theme: ${requestedTheme}`);
  if (!supportedLocales.has(requestedLocale)) throw new Error(`Unsupported locale: ${requestedLocale}`);
  if (JSON.stringify([...params.keys()]) !== JSON.stringify(expectedQueryKeys)) throw new Error("Reference query keys are missing, extra, or reordered");
  const viewport = `${params.get("width")}x${params.get("height")}`;
  if (!supportedViewports.has(viewport)) throw new Error(`Unsupported viewport: ${viewport}`);
  if (!supportedScales.has(params.get("scale"))) throw new Error(`Unsupported scale: ${params.get("scale")}`);
  if (params.get("fixture") !== data.defaults.fixture) throw new Error("Unsupported fixture");
  if (params.get("time") !== data.defaults.time) throw new Error("Unsupported time; use the deterministic fixture time");
  if (params.get("motion") !== "frozen") throw new Error("Only frozen motion is supported");
  if (params.get("network") !== "disabled") throw new Error("Network must be disabled");
  return screen;
}

function render(data) {
  const screenData = assertRoute(data);
  const copy = copyFor(screenData);
  document.documentElement.dataset.theme = requestedTheme;
  document.documentElement.lang = requestedLocale === "zh-Hant" ? "zh-Hant" : "en";
  const app = document.querySelector("#app");
  app.innerHTML = `<div class="app-shell">
    <header class="titlebar" data-testid="custom-titlebar" tabindex="0" aria-label="${escapeHtml(localized("Custom title bar", "自訂標題列"))}">
      <div class="titlebar__brand"><span class="brand-mark" aria-hidden="true">✦</span><span>${escapeHtml(localized("Claude Design Desktop reference", "Claude Design Desktop 參考"))}</span></div>
      <div class="titlebar__spacer"></div>
      <div class="window-actions" aria-label="${escapeHtml(localized("Window controls", "視窗控制"))}">
        <button type="button" data-window-action="menu" aria-label="${escapeHtml(localized("Open window menu", "開啟視窗選單"))}">⋯</button>
        <button type="button" data-window-action="minimize" aria-label="${escapeHtml(localized("Minimize window", "最小化視窗"))}">−</button>
        <button type="button" data-window-action="maximize" aria-label="${escapeHtml(localized("Maximize or restore window", "最大化或還原視窗"))}" aria-pressed="false">□</button>
        <button type="button" data-window-action="close" aria-label="${escapeHtml(localized("Close window", "關閉視窗"))}" class="close">×</button>
      </div>
    </header>
    <div class="workspace">
      <nav class="nav-rail" aria-label="Reference screens">
        <h1>${escapeHtml(localized("Reference routes", "參考路線"))}</h1><p>${escapeHtml(localized("Deterministic local design data", "固定的本機設計資料"))}</p>
        <div class="nav-list" role="tablist" aria-label="${escapeHtml(localized("Reference screens", "參考畫面"))}" aria-orientation="vertical">${data.screens.map((item) => `<button id="tab-${escapeHtml(item.id)}" class="nav-item" role="tab" aria-selected="${item.id === screenData.id}" aria-controls="panel-${escapeHtml(item.id)}" ${item.id === screenData.id ? 'aria-current="page"' : ""} data-screen="${escapeHtml(item.id)}"><span class="icon" aria-hidden="true">${navIcons[item.id] || "•"}</span>${escapeHtml(localized(item.en.title.split(" ").slice(0, 2).join(" "), item.zh.title.split(" ").slice(0, 2).join(" ")) )}</button>`).join("")}</div>
      </nav>
      <main id="panel-${escapeHtml(screenData.id)}" class="main-content" role="tabpanel" aria-labelledby="tab-${escapeHtml(screenData.id)}" tabindex="-1"><div class="main-content__inner">
        <div class="eyebrow">${escapeHtml(copy.eyebrow)}</div>
        <h2>${escapeHtml(copy.title)}</h2>
        <p class="summary">${escapeHtml(copy.summary)}</p>
        <div class="toolbar" role="search" aria-label="${escapeHtml(localized("Search this reference screen", "搜尋此參考畫面"))}"><input class="search" type="search" placeholder="${escapeHtml(localized("Search this screen", "搜尋此畫面"))}" aria-label="${escapeHtml(localized("Search this screen", "搜尋此畫面"))}"><button class="search-builder" type="button" data-action="regex" aria-label="${escapeHtml(localized("Preview advanced regex builder", "預覽進階正則表達式工具"))}">.*</button><button class="primary-action" type="button" data-action="primary">${escapeHtml(copy.primary)}</button><button class="secondary-action" type="button" data-action="secondary">${escapeHtml(copy.secondary)}</button></div>
        <section class="hero-card" aria-labelledby="hero-title"><div><span class="status-chip ${screenData.kind === "recovery" ? "warning" : ""}">${escapeHtml(screenData.kind === "recovery" ? localized("Action needed", "需要處理") : localized("Reference state", "參考狀態"))}</span><h3 id="hero-title">${escapeHtml(copy.title)}</h3><p>${escapeHtml(copy.summary)}</p><button class="outline-action" type="button" data-action="details">${escapeHtml(localized("View state details", "查看狀態詳情"))}</button></div><div class="illustration" role="img" aria-label="${escapeHtml(localized("Static reference illustration", "靜態參考插圖"))}"><div class="illustration__orb" aria-hidden="true"></div></div></section>
        <section class="card-grid" aria-label="${escapeHtml(localized("Screen capabilities", "畫面功能"))}">${screenData.items.map((item, index) => `<article class="info-card"><div class="info-card__icon" aria-hidden="true">${index + 1}</div><strong>${escapeHtml(item)}</strong><small>${escapeHtml(index % 2 ? localized("Owned local state with a clear recovery path.", "由本機擁有，並有清晰復原路徑。") : localized("Visible, keyboard reachable, and represented in the route data.", "清楚可見、可用鍵盤操作，並已在路線資料中表示。"))}</small></article>`).join("")}</section>
        <section class="detail-panel" data-details hidden><h3>${escapeHtml(localized("Deterministic capture tuple", "固定截圖組合"))}</h3><ul class="detail-list"><li>${escapeHtml(localized("Screen", "畫面"))}: <code>${escapeHtml(requestedScreen)}</code></li><li>${escapeHtml(localized("State", "狀態"))}: <code>${escapeHtml(requestedState)}</code></li><li>${escapeHtml(localized("Theme and language", "主題和語言"))}: <code>${escapeHtml(requestedTheme)} / ${escapeHtml(requestedLocale)}</code></li><li>${escapeHtml(localized("Viewport and scale", "視窗和比例"))}: <code>${escapeHtml(params.get("width"))} × ${escapeHtml(params.get("height"))} / ${escapeHtml(params.get("scale"))}</code></li><li>${escapeHtml(localized("Time, motion, and network", "時間、動態和網絡"))}: <code>${escapeHtml(params.get("time"))} / ${escapeHtml(params.get("motion"))} / ${escapeHtml(params.get("network"))}</code></li></ul></section>
        <div class="toast-region" role="status" aria-live="polite" aria-atomic="true"></div>
        <div class="metadata"><span>Fixture <code>${escapeHtml(params.get("fixture"))}</code></span><span>Version <code>0.1.0-reference</code></span><span>Updated at <code>2026-09-02 12:00:00 America/Toronto</code></span></div>
      </div></main>${data.screens.filter((item) => item.id !== screenData.id).map((item) => `<div id="panel-${escapeHtml(item.id)}" role="tabpanel" aria-labelledby="tab-${escapeHtml(item.id)}" hidden></div>`).join("")}
    </div></div>`;

  const toast = (message) => { const region = app.querySelector(".toast-region"); region.textContent = message; window.setTimeout(() => { if (region.textContent === message) region.textContent = ""; }, 3200); };
  app.querySelectorAll("[data-screen]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const next = new URL(window.location.href); next.hostname = button.dataset.screen; next.searchParams.set("state", data.screens.find((item) => item.id === button.dataset.screen).state); window.location.assign(next.href);
  }));
  const tabs = [...app.querySelectorAll('[role="tab"]')];
  tabs.forEach((tab, index) => {
    tab.tabIndex = tab.dataset.screen === screenData.id ? 0 : -1;
    tab.addEventListener("keydown", (event) => {
      let nextIndex = index;
      if (event.key === "ArrowUp") nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "ArrowDown") nextIndex = (index + 1) % tabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;
      if (nextIndex !== index) { event.preventDefault(); tabs.forEach((item, itemIndex) => { item.tabIndex = itemIndex === nextIndex ? 0 : -1; }); tabs[nextIndex].focus(); }
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); tab.click(); }
    });
  });
  app.querySelector("[data-action=details]").addEventListener("click", (event) => { event.stopPropagation(); const panel = app.querySelector("[data-details]"); panel.hidden = !panel.hidden; toast(panel.hidden ? localized("State details closed", "狀態詳情已關閉") : localized("State details opened", "狀態詳情已開啟")); });
  app.querySelector("[data-action=regex]").addEventListener("click", (event) => { event.stopPropagation(); const panel = app.querySelector("[data-details]"); panel.hidden = false; toast(localized("Static preview: advanced regex builder is anchored to this search field", "靜態預覽：進階正則表達式工具會連結到此搜尋欄")); });
  app.querySelector("[data-action=primary]").addEventListener("click", (event) => { event.stopPropagation(); toast(localized(`Reference action selected: ${copy.primary}`, `參考動作已選取：${copy.primary}`)); });
  app.querySelector("[data-action=secondary]").addEventListener("click", (event) => { event.stopPropagation(); toast(localized(`Reference action selected: ${copy.secondary}`, `參考動作已選取：${copy.secondary}`)); });
  app.querySelector(".search").addEventListener("input", (event) => { const query = event.target.value.trim().toLowerCase(); app.querySelectorAll(".info-card").forEach((card) => { card.hidden = query.length > 0 && !card.textContent.toLowerCase().includes(query); }); toast(query ? localized("Screen cards filtered locally", "畫面卡片已在本機篩選") : localized("Screen filter cleared", "畫面篩選已清除")); });
  app.querySelectorAll("[data-window-action]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); window.designReference?.window?.[button.dataset.windowAction]?.(); }));
  const titlebar = app.querySelector(".titlebar");
  titlebar.addEventListener("dblclick", (event) => { if (!event.target.closest("[data-window-action]")) window.designReference?.window?.maximize?.(); });
  titlebar.addEventListener("keydown", (event) => { if ((event.key === "Enter" || event.key === " ") && !event.target.closest("[data-window-action]")) { event.preventDefault(); window.designReference?.window?.maximize?.(); } });
  window.designReference?.window?.onState?.((state) => { const button = app.querySelector('[data-window-action="maximize"]'); if (button) { button.setAttribute("aria-pressed", String(state.maximized)); button.setAttribute("aria-label", state.maximized ? localized("Restore window", "還原視窗") : localized("Maximize window", "最大化視窗")); button.textContent = state.maximized ? "❐" : "□"; } });
  window.__DESIGN_REFERENCE_READY__ = { tuple: Object.fromEntries(params.entries()), screen: screenData.id, state: screenData.state };
}

window.designReference?.data?.().then((data) => render(data)).catch((error) => { document.querySelector("#app").textContent = error.message; });
