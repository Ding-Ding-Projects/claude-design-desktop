import assert from 'node:assert/strict';
import { createRegexResultDispatcher } from './controllers.mjs';

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
}

console.log('PASS: asynchronous worker results apply to feature, docs, and context-menu scopes; stale results are refused');
