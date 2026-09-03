export function resolveProtocolResponse(requestUrl, { parseRoute, files }) {
  const url = new URL(requestUrl);
  const route = parseRoute(requestUrl);
  const pathname = url.pathname === "" || url.pathname === "/" ? "/index.html" : url.pathname;
  const file = files[pathname];
  if (!file) return null;
  return { route, path: file[0], contentType: file[1] };
}
