import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const site = join(root, 'site');
const docs = join(root, 'docs', 'features');
const html = await readFile(join(site, 'index.html'), 'utf8');
const js = await readFile(join(site, 'app.js'), 'utf8');
const css = await readFile(join(site, 'styles.css'), 'utf8');
const files = (await readdir(docs)).filter((file) => file.endsWith('.md') && file !== 'README.md');
const expected = ['language-modes', 'dialog-emoji-toggle', 'school-mode', 'narration', 'scheduled-settings', 'dim-sum-surprise', 'regex-builders', 'notification-centre', 'appearance-editors', 'tabbed-navigation', 'offline-documentation', 'command-palette', 'destructive-confirmation', 'local-history', 'changelog-viewer', 'external-editor', 'exports', 'bulk-actions', 'accessibility-responsive-sizing', 'personal-vocabulary-upload', 'toy-locks-authentication', 'unlock-ladder', 'shared-link-embed', 'adhd-modes', 'browser-download-surfaces', 'app-logo-customization', 'file-converter', 'ollama-suite-manager', 'status-hub', 'front-screen-provenance'];
const articleIds = files.map((file) => file.slice(0, -3));
const must = (condition, message) => { if (!condition) throw new Error(message); };
const assertInventory = (source) => {
  must(expected.every((id) => new RegExp(`['"]${id}['"]`).test(source)), 'canonical feature missing from site inventory');
  must(expected.every((id) => articleIds.includes(id)), 'canonical feature missing an article');
  must(articleIds.length === expected.length, 'article inventory contains an unexpected or duplicate article');
};
assertInventory(js);
const brokenInventory = js.replaceAll("'language-modes'", "'language-mode-missing'");
must(brokenInventory !== js, 'mutation probe did not change the source');
let mutationFailed = false;
try { assertInventory(brokenInventory); } catch { mutationFailed = true; }
must(mutationFailed, 'inventory mutation probe stayed green');
assertInventory(js);
for (const marker of ['og:title', 'og:description', 'og:url', 'og:type', 'og:site_name', 'twitter:card', 'theme-color']) must(html.includes(marker), `missing metadata: ${marker}`);
must(!html.includes('property="og:image"'), 'an OG image URL cannot be emitted before a verified image exists');
must(!html.includes('social-preview.png'), 'a placeholder social preview URL must not be emitted');
must(html.includes('width=device-width'), 'responsive viewport metadata is missing');
must(css.includes('min-width: 320px'), 'responsive minimum is missing');
must(html.includes('Content-Security-Policy'), 'strict static CSP is missing');
must(!/<script[^>]+src=['"]https?:/i.test(html), 'remote script is not allowed');
must(!/<link[^>]+href=['"]https?:/i.test(html), 'remote stylesheet is not allowed');
must(!/github\.com\/Ding-Ding-Projects\/claude-design-desktop\/blob\/main\/docs\/features/.test(js), 'documentation articles must render from local bundled data');
console.log(`PASS: static source inventory (${expected.length} features, ${articleIds.length} articles); runtime behavior is not inferred`);
