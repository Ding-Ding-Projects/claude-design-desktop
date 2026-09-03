import assert from 'node:assert/strict';
import { createVisitorController } from './controllers.mjs';

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
assert.deepEqual(controller.dispatchAction(created, 'click'), { kind: 'unlock-required', targetId: created });
assert.deepEqual(controller.dispatchAction(created, 'keydown'), { kind: 'unlock-required', targetId: created });
assert.deepEqual(controller.dispatchAction(created, 'programmatic'), { kind: 'unlock-required', targetId: created });
assert.equal(controller.unlock(created, 'local phrase'), true);
assert.deepEqual(controller.dispatchAction(created, 'click'), { kind: 'action', targetId: created, eventType: 'click' });

const scoped = controller.search([{ scope: 'a', label: 'one' }, { scope: 'b', label: 'two' }], 'one', (item) => item.label);
assert.deepEqual(scoped, [{ scope: 'a', label: 'one' }], 'search must filter only its own collection');
console.log('PASS: visitor controllers execute tab, group, lock, and scoped-search behavior');
