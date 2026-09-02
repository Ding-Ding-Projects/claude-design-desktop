const params = new URLSearchParams(window.location.search);
const requestedScreen = params.get("screen") || "signin";
const requestedState = params.get("state") || "default";
const requestedTheme = params.get("theme") === "dark" ? "dark" : "light";
const requestedLocale = params.get("locale") || "en-US";
const tuple = {
  screen: requestedScreen,
  state: requestedState,
  theme: requestedTheme,
  locale: requestedLocale,
  width: Number(params.get("width") || 1280),
  height: Number(params.get("height") || 800),
  scale: Number(params.get("scale") || 1),
  fixture: params.get("fixture") || "claude-design-desktop-reference-v1",
  time: params.get("time") || "2026-09-02T12:00:00.000Z",
  motion: params.get("motion") || "frozen",
  random: Number(params.get("random") || 3003),
  network: params.get("network") || "disabled"
};

const navIcons = { signin: "↗", accounts: "◎", projects: "▦", editor: "✎", sharing: "⇄", settings: "⚙", features: "✦", downloads: "↓", recovery: "!" };
const resolveCopy = (screen) => {
  const localized = requestedLocale === "zh-Hant" ? screen.zh : screen.en;
  if (requestedLocale === "bilingual") return { eyebrow: `${screen.en.eyebrow} · ${screen.zh.eyebrow}`, title: `${screen.en.title} · ${screen.zh.title}`, summary: `${screen.en.summary} ${screen.zh.summary}`, primary: `${screen.en.primary} · ${screen.zh.primary}`, secondary: `${screen.en.secondary} · ${screen.zh.secondary}` };
  return localized;
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

function render(screenData, allScreens) {
  document.documentElement.dataset.theme = requestedTheme;
  document.documentElement.lang = requestedLocale === "zh-Hant" ? "zh-Hant" : "en";
  const copy = resolveCopy(screenData);
  const app = document.querySelector("#app");
  app.innerHTML = `<div class="app-shell">
    <header class="titlebar" data-testid="custom-titlebar">
      <div class="titlebar__brand"><span class="brand-mark" aria-hidden="true">✦</span><span>Claude Design Desktop reference</span></div>
      <div class="titlebar__spacer"></div>
      <div class="window-actions" aria-label="Window controls">
        <button type="button" data-window-action="minimize" aria-label="Minimize window">−</button>
        <button type="button" data-window-action="maximize" aria-label="Maximize or restore window">□</button>
        <button type="button" data-window-action="close" aria-label="Close window" class="close">×</button>
      </div>
    </header>
    <div class="workspace">
      <nav class="nav-rail" aria-label="Reference screens">
        <h1>Reference routes</h1><p>Deterministic local design data</p>
        <div class="nav-list" role="tablist" aria-label="Reference screens">${allScreens.map((item) => `<button class="nav-item" role="tab" aria-selected="${item.id === screenData.id}" aria-current="${item.id === screenData.id ? "page" : "false"}" data-screen="${escapeHtml(item.id)}"><span class="icon" aria-hidden="true">${navIcons[item.id] || "•"}</span>${escapeHtml(item.en.title.split(" ").slice(0, 2).join(" "))}</button>`).join("")}</div>
      </nav>
      <main class="main-content" tabindex="-1"><div class="main-content__inner">
        <div class="eyebrow">${escapeHtml(copy.eyebrow)}</div>
        <h2>${escapeHtml(copy.title)}</h2>
        <p class="summary">${escapeHtml(copy.summary)}</p>
        <div class="toolbar" role="search" aria-label="Search this reference screen"><input class="search" type="search" placeholder="Search this screen" aria-label="Search this screen"><button class="search-builder" type="button" aria-label="Open advanced regex builder">.*</button><button class="primary-action" type="button">${escapeHtml(copy.primary)}</button><button class="secondary-action" type="button">${escapeHtml(copy.secondary)}</button></div>
        <section class="hero-card" aria-labelledby="hero-title"><div><span class="status-chip ${screenData.kind === "recovery" ? "warning" : ""}">${screenData.kind === "recovery" ? "Action needed" : "Reference state"}</span><h3 id="hero-title">${escapeHtml(screenData.en.title)}</h3><p>${escapeHtml(screenData.en.summary)}</p><button class="outline-action" type="button" data-action="details">View state details</button></div><div class="illustration" aria-label="Decorative reference illustration"><div class="illustration__orb" aria-hidden="true"></div></div></section>
        <section class="card-grid" aria-label="Screen capabilities">${screenData.items.map((item, index) => `<article class="info-card"><div class="info-card__icon" aria-hidden="true">${index + 1}</div><strong>${escapeHtml(item)}</strong><small>${escapeHtml(index % 2 ? "Owned local state with a clear recovery path." : "Visible, keyboard reachable, and represented in the route data.")}</small></article>`).join("")}</section>
        <section class="detail-panel" data-details hidden><h3>Deterministic capture tuple</h3><ul class="detail-list"><li>Screen: <code>${escapeHtml(tuple.screen)}</code></li><li>State: <code>${escapeHtml(tuple.state)}</code></li><li>Theme and language: <code>${escapeHtml(tuple.theme)} / ${escapeHtml(tuple.locale)}</code></li><li>Viewport and scale: <code>${escapeHtml(tuple.width)} × ${escapeHtml(tuple.height)} / ${escapeHtml(tuple.scale)}</code></li><li>Time, motion, and network: <code>${escapeHtml(tuple.time)} / ${escapeHtml(tuple.motion)} / ${escapeHtml(tuple.network)}</code></li></ul></section>
        <div class="metadata"><span>Fixture <code>${escapeHtml(tuple.fixture)}</code></span><span>Version <code>0.1.0-reference</code></span><span>Updated at <code>2026-09-02 12:00:00 America/Toronto</code></span></div>
      </div></main>
    </div></div>`;

  app.querySelectorAll("[data-screen]").forEach((button) => button.addEventListener("click", () => {
    const next = new URL(window.location.href); next.searchParams.set("screen", button.dataset.screen); next.searchParams.set("state", button.dataset.screen === "editor" ? "preview" : button.dataset.screen === "sharing" ? "roles" : button.dataset.screen === "settings" ? "appearance" : button.dataset.screen === "downloads" ? "progress" : button.dataset.screen === "recovery" ? "offline" : "default"); window.location.assign(next.href);
  }));
  app.querySelector("[data-action=details]").addEventListener("click", () => { const panel = app.querySelector("[data-details]"); panel.hidden = !panel.hidden; });
  app.querySelector(".search").addEventListener("input", (event) => { const query = event.target.value.trim().toLowerCase(); app.querySelectorAll(".info-card").forEach((card) => { card.hidden = query.length > 0 && !card.textContent.toLowerCase().includes(query); }); });
  app.querySelectorAll("[data-window-action]").forEach((button) => button.addEventListener("click", () => window.designReference?.window?.[button.dataset.windowAction]?.()));
  window.__DESIGN_REFERENCE_READY__ = { tuple, screen: screenData.id, state: screenData.state };
}

fetch("./screens.json", { cache: "no-store" }).then((response) => { if (!response.ok) throw new Error(`Reference data unavailable: ${response.status}`); return response.json(); }).then((data) => {
  const screen = data.screens.find((candidate) => candidate.id === requestedScreen && candidate.state === requestedState) || data.screens.find((candidate) => candidate.id === requestedScreen) || data.screens[0];
  render(screen, data.screens);
}).catch((error) => { document.querySelector("#app").textContent = error.message; });
