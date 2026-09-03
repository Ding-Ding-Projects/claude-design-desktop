const expectedQueryKeys = ["state", "theme", "locale", "width", "height", "scale", "fixture", "time", "motion", "network"];
const supportedThemes = new Set(["light", "dark"]);
const supportedLocales = new Set(["en-US", "zh-Hant", "bilingual"]);
const supportedScales = new Set([1, 1.25, 1.5, 2]);
const supportedViewports = new Set(["1280x800", "960x700", "720x900"]);

export function createRouteParser(routes) {
  return function parseRoute(candidate) {
    let url;
    try { url = new URL(candidate); } catch { throw new Error("Invalid design-reference route: the URL is malformed"); }
    if (url.protocol !== "design-reference:") throw new Error("Invalid design-reference route: the protocol must be design-reference:");
    if (!url.hostname) throw new Error("Invalid design-reference route: the screen host is missing");
    if ([...url.searchParams.keys()].join("|") !== expectedQueryKeys.join("|")) throw new Error("Invalid design-reference route: the query keys are missing, extra, or reordered");
    const screen = routes.screens.find((item) => item.id === url.hostname);
    if (!screen) throw new Error(`Invalid design-reference route: unknown screen ${url.hostname}`);
    const state = url.searchParams.get("state");
    if (state !== screen.state) throw new Error(`Invalid design-reference route: unsupported state ${state} for ${screen.id}`);
    const theme = url.searchParams.get("theme");
    if (!supportedThemes.has(theme)) throw new Error(`Invalid design-reference route: unsupported theme ${theme}`);
    const locale = url.searchParams.get("locale");
    if (!supportedLocales.has(locale)) throw new Error(`Invalid design-reference route: unsupported locale ${locale}`);
    const width = Number(url.searchParams.get("width"));
    const height = Number(url.searchParams.get("height"));
    if (!Number.isInteger(width) || !Number.isInteger(height) || !supportedViewports.has(`${width}x${height}`)) throw new Error(`Invalid design-reference route: unsupported viewport ${width}x${height}`);
    const scale = Number(url.searchParams.get("scale"));
    if (!supportedScales.has(scale)) throw new Error(`Invalid design-reference route: unsupported scale ${scale}`);
    if (url.searchParams.get("fixture") !== routes.defaults.fixture) throw new Error("Invalid design-reference route: unsupported fixture");
    if (url.searchParams.get("time") !== routes.defaults.time) throw new Error("Invalid design-reference route: unsupported time; deterministic time must match the reference fixture");
    if (url.searchParams.get("motion") !== "frozen") throw new Error(`Invalid design-reference route: unsupported motion ${url.searchParams.get("motion")}; only frozen motion is supported`);
    if (url.searchParams.get("network") !== "disabled") throw new Error(`Invalid design-reference route: unsupported network value ${url.searchParams.get("network")}; network must be disabled`);
    return { url, screen, state, theme, locale, width, height, scale };
  };
}
