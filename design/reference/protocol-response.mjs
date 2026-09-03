export function resolveProtocolResponse(requestUrl, { parseRoute, files, fallbackRoute }) {
  const url = new URL(requestUrl);
  const pathname = url.pathname === "" || url.pathname === "/" ? "/index.html" : url.pathname;
  const file = files[pathname];
  if (!file) return null;
  const isEntry = pathname === "/index.html";
  if (isEntry) return { status: 200, route: parseRoute(requestUrl), path: file[0], contentType: file[1] };
  if ([...url.searchParams.keys()].length > 0) throw new Error("Static resource requests must omit the deterministic tuple query");
  if (!fallbackRoute || url.hostname !== fallbackRoute.screen.id) throw new Error("Static resource host is not the active reference screen");
  return { status: 200, route: fallbackRoute, path: file[0], contentType: file[1] };
}
