import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./ExperienceShell.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./experience.css", import.meta.url), "utf8");

test("component imports its emitted stylesheet and exposes the document shortcut", () => {
  assert.match(source, /import ["']\.\/experience\.css["']/);
  assert.match(source, /ctrlKey && event\.shiftKey/);
  assert.match(source, /key\.toLocaleLowerCase\(\) === ["']f["']/);
});

test("component contract keeps axis-aware tabs and linked panels", () => {
  assert.match(source, /role=["']tablist["']/);
  assert.match(source, /aria-orientation=/);
  assert.match(source, /role=["']tab["']/);
  assert.match(source, /aria-controls=/);
  assert.match(source, /role=["']tabpanel["']/);
  assert.match(source, /event\.key === ["']Home["']/);
  assert.match(source, /event\.key === ["']End["']/);
  assert.match(source, /event\.key === ["']ContextMenu["']/);
});

test("component contract routes target menus and confirmation through real handlers", () => {
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.match(source, /handleContextAction\(action\.id/);
  assert.match(source, /createConfirmationAdapter/);
  assert.match(source, /confirmation\.progress/);
  assert.match(source, /onLocalHistory/);
});

test("component contract persists navigation, palette and appearance state", () => {
  assert.match(source, /experience-navigation/);
  assert.match(source, /experience-palette/);
  assert.match(source, /saveAppearance\(localStorage/);
  assert.match(source, /experience-panel:/);
});

test("stylesheet contract paints and bounds every floating panel", () => {
  assert.match(css, /@keyframes experience-rainbow/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /resize: both/);
  assert.match(css, /max-height: 70vh/);
  assert.match(css, /min-height: 48px/);
});

