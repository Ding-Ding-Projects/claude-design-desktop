import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createVisitorController } from './controllers.mjs';

const source = await readFile(new URL('./app.js', import.meta.url), 'utf8');
assert.match(source, /from ['"]\.\/controllers\.mjs['"]/);
for (const call of ['visitorController.addTab(', 'visitorController.togglePin(', 'visitorController.createGroup(', 'visitorController.lock(', 'visitorController.unlock(', 'visitorController.dispatchAction(']) assert.ok(source.includes(call), `app.js must call tested controller method ${call}`);
assert.match(source, /const regexState = new Map\(\)/);
assert.match(source, /MAX_REGEX_PATTERN = 2048/);
assert.match(source, /MAX_REGEX_SAMPLE = 100000/);
assert.match(source, /dispatchSearch\(regexTarget\)/);

const writes = [];
const controller = createVisitorController({ set: async (key, value) => writes.push({ key, value }) });
const tabId = controller.addTab('Integration tab');
controller.togglePin(tabId);
controller.createGroup('Integration group');
assert.equal(writes.length, 3, 'controller integration must persist each UI-owned mutation');
assert.deepEqual(controller.dispatchAction(tabId, 'click'), { kind: 'action', targetId: tabId, eventType: 'click' });
assert.equal(controller.lock(tabId, 'four-char phrase', { policy: 'password', durationMs: 60000 }), true);
assert.equal(controller.dispatchAction(tabId, 'click').kind, 'unlock-required');
assert.equal(controller.unlock(tabId, 'wrong') , false);
assert.equal(controller.unlock(tabId, 'four-char phrase') , true);
console.log('PASS: app.js imports and consumes visitor controllers; regex and lock seams are wired');
