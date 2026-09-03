import assert from 'node:assert/strict';
import { createVisitorController, styleFunnyCopy } from './controllers.mjs';

const saved = [];
const store = { set: async (key, value) => saved.push({ key, value }) };
const controller = createVisitorController(store);

const created = controller.addTab('Research');
assert.equal(created, 'tab-4');
assert.equal(controller.state.tabs.at(-1).label, 'Research');
assert.equal(controller.togglePin(created), true);
assert.equal(controller.state.tabs.at(-1).pinned, true);
const group = controller.createGroup('Working set');
assert.equal(controller.moveToGroup(created, group.id), true);
assert.equal(controller.state.tabs.at(-1).groupId, group.id);
assert.equal(saved.length, 4, 'tab, pin, group, and move mutations must persist');

assert.equal(controller.lock(created, 'local phrase'), true);
assert.equal(controller.state.locks[created].credentialStorage, 'browser-storage-only');
assert.deepEqual(controller.dispatchAction(created, 'click'), { kind: 'unlock-required', targetId: created, policy: 'password' });
assert.deepEqual(controller.dispatchAction(created, 'keydown'), { kind: 'unlock-required', targetId: created, policy: 'password' });
assert.deepEqual(controller.dispatchAction(created, 'programmatic'), { kind: 'unlock-required', targetId: created, policy: 'password' });
assert.equal(controller.unlock(created, 'local phrase'), true);
assert.deepEqual(controller.dispatchAction(created, 'click'), { kind: 'action', targetId: created, eventType: 'click' });
assert.equal(controller.lock(created, 'time-limited', { policy: 'PIN plus password', durationMs: 1000 }), true);
assert.equal(controller.unlock(created, 'wrong', 100), false);
assert.equal(controller.unlock(created, 'time-limited', 200), true);
assert.equal(controller.dispatchAction(created, 'click', 1199).kind, 'action');
assert.equal(controller.dispatchAction(created, 'click', 1200).kind, 'unlock-required');
for (let attempt = 0; attempt < 5; attempt += 1) assert.equal(controller.unlock(created, 'wrong', 2000 + attempt), false);
assert.equal(controller.unlock(created, 'time-limited', 2005), false, 'rate limit must refuse after five failed attempts');

const scoped = controller.search([{ scope: 'a', label: 'one' }, { scope: 'b', label: 'two' }], 'one', (item) => item.label);
assert.deepEqual(scoped, [{ scope: 'a', label: 'one' }], 'search must filter only its own collection');
const serious = styleFunnyCopy('Status updates stay precise.', '狀態更新保持準確。', { english: 1, cantonese: 1 }, 'bilingual');
const playful = styleFunnyCopy('Status updates stay precise.', '狀態更新保持準確。', { english: 5, cantonese: 5 }, 'bilingual');
assert.notEqual(playful, serious, 'funny-level values must change representative English and Cantonese copy');
assert.match(playful, /one small wink/);
assert.match(playful, /加少少笑意/);
console.log('PASS: visitor controllers execute tab, group, lock, and scoped-search behavior');
