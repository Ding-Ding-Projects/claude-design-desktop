import assert from "node:assert/strict";
import { clampWindowBounds, validPersistedState } from "../design/reference/window-state.mjs";

const laptop = { x: 0, y: 0, width: 1366, height: 768 };
const bounded = clampWindowBounds({ x: -400, y: -300, width: 3000, height: 3000 }, laptop);
assert.deepEqual(bounded, { x: 0, y: 0, width: 1297, height: 729 });
assert.equal(validPersistedState({ normal: bounded, maximized: false }), true);
assert.equal(validPersistedState({ normal: bounded, maximized: "yes" }), false);
assert.equal(validPersistedState({ normal: { width: 1 }, maximized: false }), false);
console.log("PASS: persisted bounds clamp to 95 percent of the work area and invalid states are refused");
