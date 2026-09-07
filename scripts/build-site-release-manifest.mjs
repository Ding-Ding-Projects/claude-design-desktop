// Bind the public site to one verified, immutable GitHub Release.
//
//   node scripts/build-site-release-manifest.mjs --tag preview-12-410c2bc8aaaa
//   node scripts/build-site-release-manifest.mjs --check      # exit 1 when site files drift from the recorded release
//
// Writes site/release-manifest.json and site/version.json from the release record itself: the tag,
// target commit, publication time, immutable asset URLs, sizes, and the SHA-256 lines the release
// workflow wrote into the notes. Every asset URL is HEAD-checked before it is written. Nothing here
// invents a timestamp, a hash, or a candidate URL.
import { readFile, writeFile } from "node:fs/promises";

const REPOSITORY = "Ding-Ding-Projects/claude-design-desktop";
const args = process.argv.slice(2);
const check = args.includes("--check");
const tagIndex = args.indexOf("--tag");
const manifestPath = "site/release-manifest.json";
const versionPath = "site/version.json";
const headers = { accept: "application/vnd.github+json", "user-agent": "claude-design-desktop-site-manifest" };
if (process.env.GH_TOKEN) headers.authorization = `Bearer ${process.env.GH_TOKEN}`;

async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }

async function releaseRecord(tag) {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/tags/${encodeURIComponent(tag)}`, { headers, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Release ${tag} could not be read: HTTP ${response.status}`);
  const release = await response.json();
  if (release.draft) throw new Error(`Release ${tag} is a draft and cannot bind the site.`);
  return release;
}

function hashesFromBody(body) {
  const hashes = new Map();
  for (const line of String(body || "").split(/\r?\n/)) {
    const match = line.match(/^([^\s:]+(?:\.[a-z0-9]+)?|RELEASES):\s*([0-9a-f]{64})\s*$/i);
    if (match) hashes.set(match[1], match[2].toLowerCase());
  }
  return hashes;
}

async function buildManifest(tag) {
  const release = await releaseRecord(tag);
  const pkg = await readJson("package.json");
  const hashes = hashesFromBody(release.body);
  const codeName = String(release.body || "").match(/Dim-sum code name:\s*([^\r\n]+?)\s*·\s*(\S[^\r\n]*)/i);
  const assets = [];
  for (const asset of release.assets || []) {
    const url = String(asset.browser_download_url || "");
    const expectedPrefix = `https://github.com/${REPOSITORY}/releases/download/${tag}/`;
    if (!url.startsWith(expectedPrefix)) throw new Error(`Asset ${asset.name} is not an immutable release URL: ${url}`);
    const sha256 = hashes.get(asset.name);
    if (!sha256) throw new Error(`Release notes carry no SHA-256 line for ${asset.name}.`);
    const head = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(20_000) });
    if (!head.ok) throw new Error(`Asset ${asset.name} is not downloadable: HTTP ${head.status}`);
    assets.push({ name: asset.name, size: asset.size, url, sha256 });
  }
  for (const required of ["Setup.exe", "RELEASES"]) if (!assets.some((asset) => asset.name === required)) throw new Error(`Release ${tag} is missing ${required}.`);
  if (!assets.some((asset) => asset.name.endsWith(".nupkg"))) throw new Error(`Release ${tag} is missing the full .nupkg.`);
  const manifest = {
    schemaVersion: 1,
    repository: REPOSITORY,
    tag,
    releaseUrl: release.html_url,
    commit: release.target_commitish,
    publishedAt: release.published_at,
    timezone: "UTC",
    version: pkg.version,
    platform: "win32-x64",
    installer: "squirrel-windows",
    signing: "unsigned",
    prerelease: Boolean(release.prerelease),
    codeName: codeName ? { en: codeName[1].trim(), zhHant: codeName[2].trim() } : null,
    assets
  };
  const version = {
    schemaVersion: 1,
    version: pkg.version,
    updatedAt: release.published_at,
    timezone: "UTC",
    sourceCommit: release.target_commitish,
    releaseTag: tag,
    provenanceStatus: release.prerelease ? "published-prerelease" : "published-release"
  };
  return { manifest, version };
}

if (check) {
  const current = await readJson(manifestPath);
  const { manifest, version } = await buildManifest(current.tag);
  const drift = [];
  if (JSON.stringify(manifest) !== JSON.stringify(current)) drift.push(manifestPath);
  if (JSON.stringify(version) !== JSON.stringify(await readJson(versionPath))) drift.push(versionPath);
  if (drift.length) { console.error(`Site release binding drifted from ${current.tag}: ${drift.join(", ")}`); process.exit(1); }
  console.log(`Site release binding is current for ${current.tag} (${manifest.assets.length} verified assets).`);
} else {
  if (tagIndex === -1 || !args[tagIndex + 1]) { console.error("Usage: --tag <release-tag> | --check"); process.exit(2); }
  const { manifest, version } = await buildManifest(args[tagIndex + 1]);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(versionPath, `${JSON.stringify(version, null, 2)}\n`, "utf8");
  console.log(`Wrote ${manifestPath} and ${versionPath} for ${manifest.tag} (${manifest.assets.length} verified assets, published ${manifest.publishedAt}).`);
}
