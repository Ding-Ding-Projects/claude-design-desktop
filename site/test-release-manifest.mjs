import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source-level contract for the site's release binding. It proves the manifest shape, the immutable
// asset URLs, the hash format, the version.json binding, and that app.js actually consumes the
// manifest. It does not fetch anything; served-site proof belongs to the deployment verification.
const root = fileURLToPath(new URL('..', import.meta.url));
const site = join(root, 'site');
const must = (condition, message) => { if (!condition) throw new Error(message); };
const manifest = JSON.parse(await readFile(join(site, 'release-manifest.json'), 'utf8'));
const version = JSON.parse(await readFile(join(site, 'version.json'), 'utf8'));
const js = await readFile(join(site, 'app.js'), 'utf8');

function assertManifest(m, v) {
  must(m.schemaVersion === 1, 'manifest schemaVersion must be 1');
  must(/^preview-\d+-[0-9a-f]{12}$|^v?\d+\.\d+\.\d+$/.test(m.tag), 'manifest tag must be a release tag');
  must(/^[0-9a-f]{40}$/.test(m.commit), 'manifest commit must be a full SHA');
  must(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(m.publishedAt), 'manifest publishedAt must be an ISO UTC timestamp');
  must(m.platform === 'win32-x64' && m.installer === 'squirrel-windows' && m.signing === 'unsigned', 'manifest platform, installer, and signing state must be exact');
  must(Array.isArray(m.assets) && m.assets.length >= 3, 'manifest must carry Setup.exe, RELEASES, and the full nupkg');
  const prefix = `https://github.com/${m.repository}/releases/download/${m.tag}/`;
  for (const asset of m.assets) {
    must(asset.url.startsWith(prefix), `asset URL is not immutable: ${asset.url}`);
    must(/^[0-9a-f]{64}$/.test(asset.sha256), `asset ${asset.name} lacks a SHA-256`);
    must(Number.isInteger(asset.size) && asset.size > 0, `asset ${asset.name} lacks a size`);
  }
  for (const required of ['Setup.exe', 'RELEASES']) must(m.assets.some((a) => a.name === required), `manifest is missing ${required}`);
  must(v.updatedAt === m.publishedAt && v.sourceCommit === m.commit && v.releaseTag === m.tag, 'version.json must be bound to the same release as the manifest');
  must(v.provenanceStatus === 'published-prerelease' || v.provenanceStatus === 'published-release', 'version.json provenanceStatus must name a published state');
}
assertManifest(manifest, version);

// Negative probe: a mutated manifest must turn red, and the mutation itself must have landed.
const broken = JSON.parse(JSON.stringify(manifest));
broken.assets[0].url = broken.assets[0].url.replace('/releases/download/', '/releases/latest/download/');
must(broken.assets[0].url !== manifest.assets[0].url, 'mutation probe did not change the manifest');
let failed = false;
try { assertManifest(broken, version); } catch { failed = true; }
must(failed, 'manifest mutation probe stayed green');

// The site must consume the manifest, not merely ship it.
must(/fetch\('\.\/release-manifest\.json'/.test(js), 'app.js must fetch ./release-manifest.json');
must(/^\s*async function loadReleaseManifest\(/m.test(js), 'app.js must define loadReleaseManifest');
must(/^\s*loadReleaseManifest\(\);/m.test(js) || /loadReleaseManifest\(\)/.test(js.replace(/async function loadReleaseManifest[\s\S]*?\n}/, '')), 'app.js must call loadReleaseManifest');
for (const id of ['downloads-release', 'release-state-value', 'public-release-card']) must(js.includes(`id="${id}"`), `app.js is missing the ${id} binding target`);
console.log(`PASS: site release binding for ${manifest.tag} (${manifest.assets.length} immutable assets, version.json bound to ${manifest.publishedAt})`);
