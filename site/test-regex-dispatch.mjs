import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRegexResultDispatcher } from './controllers.mjs';

const appSource = await readFile(new URL('./app.js', import.meta.url), 'utf8');
assert.match(appSource, /const request = regexDispatcher\.nextRequest\(\); runBoundedRegex\([^\n]+request\)/);
assert.match(appSource, /function runBoundedRegex\(pattern, flags, samples, requestId\)/);
assert.match(appSource, /worker\.postMessage\(\{ id, pattern, flags, samples \}\)/);
assert.doesNotMatch(appSource, /function runBoundedRegex\([^\n]+\n[^\n]*\+\+regexRequest/);

const applyAsync = (dispatcher, rows, matches, requestId) => Promise.resolve().then(() => dispatcher.apply(rows, matches, requestId));

for (const [scope, labels] of [
  ['feature', ['language modes', 'regex builders']],
  ['docs', ['language article', 'regex article']],
  ['context menu', ['Edit appearance…', 'Lock this element…', 'Copy accessible name']]
]) {
  const dispatcher = createRegexResultDispatcher();
  const rows = labels.map((label) => ({ label, hidden: false }));
  const oldRequest = dispatcher.nextRequest();
  const stale = applyAsync(dispatcher, rows, [false, true, false], oldRequest);
  const currentRequest = dispatcher.nextRequest();
  const current = applyAsync(dispatcher, rows, rows.map((row) => row.label.toLowerCase().includes(scope === 'context menu' ? 'element' : 'regex')), currentRequest);
  assert.equal(await stale, false, `${scope} stale worker result must be refused`);
  assert.equal(await current, true, `${scope} current worker result must apply`);
  assert.deepEqual(rows.map((row) => row.hidden), scope === 'context menu' ? [true, false, true] : [true, false]);
  assert.equal(dispatcher.currentRequest(), currentRequest, `${scope} keeps one caller-owned current request ID`);
}

console.log('PASS: asynchronous worker results apply to feature, docs, and context-menu scopes; stale results are refused');
