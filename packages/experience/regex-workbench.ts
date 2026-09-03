import type { RegexWorkbenchState } from "./types";

const MAX_PATTERN = 4_096;
const MAX_SAMPLE = 32_768;
const MAX_TRACE = 200;

const capabilities = [
  ["literals", true, "Plain and escaped literals are supported."],
  ["Unicode code points", true, "Unicode escapes and Unicode property escapes are supported by the JavaScript engine."],
  ["character classes", true, "Character classes and ranges are supported."],
  ["named captures", true, "Named and numbered capture groups are supported."],
  ["non-capturing groups", true, "Non-capturing groups are supported."],
  ["atomic groups", false, "The selected JavaScript engine does not expose atomic groups."],
  ["alternation", true, "Alternation is supported."],
  ["greedy and lazy quantifiers", true, "Greedy and lazy quantifiers are supported."],
  ["possessive quantifiers", false, "Possessive quantifiers are not available in this engine."],
  ["lookaround", true, "Lookahead and lookbehind are supported by current JavaScript."],
  ["backreferences", true, "Numbered and named backreferences are supported."],
  ["conditionals and subroutines", false, "Conditionals and subroutines are not available in this engine."],
  ["inline modifiers", false, "Inline flag modifiers are not available in this engine."],
  ["replacement templates", true, "Replacement templates use String.replace semantics."]
] as const;

export function createRegexWorkbench(pattern = "", sample = ""): RegexWorkbenchState {
  const state: RegexWorkbenchState = {
    engine: "ECMAScript RegExp",
    engineVersion: "runtime supplied",
    dialect: "ECMAScript",
    pattern,
    flags: "",
    sample,
    replacement: "",
    mode: "text",
    valid: true,
    explanation: "Enter a pattern to see its structure and matches.",
    tokens: [],
    matches: [],
    replacementPreview: sample,
    tests: [],
    snippets: [],
    performance: { elapsedMs: 0, matchCount: 0, risk: "low" },
    trace: [],
    capabilities: capabilities.map(([name, supported, explanation]) => ({ name, supported, explanation }))
  };
  return analyzeRegex(state);
}

export function setRegexInput(state: RegexWorkbenchState, input: Partial<Pick<RegexWorkbenchState, "pattern" | "flags" | "sample" | "replacement" | "mode">>): RegexWorkbenchState {
  return analyzeRegex({ ...state, ...input });
}

export function addRegexTest(state: RegexWorkbenchState, input: string, expected: boolean): RegexWorkbenchState {
  return { ...state, tests: [...state.tests, { id: `test-${state.tests.length + 1}`, input, expected }] };
}

export function runRegexTests(state: RegexWorkbenchState): RegexWorkbenchState {
  return {
    ...state,
    tests: state.tests.map((test) => ({ ...test, actual: safeTest(state, test.input) }))
  };
}

export function saveRegexSnippet(state: RegexWorkbenchState, name: string): RegexWorkbenchState {
  const trimmed = name.trim();
  if (!trimmed || !state.valid) return state;
  return { ...state, snippets: [...state.snippets, { id: `snippet-${state.snippets.length + 1}`, name: trimmed, pattern: state.pattern, flags: state.flags }] };
}

function analyzeRegex(state: RegexWorkbenchState): RegexWorkbenchState {
  if (state.pattern.length > MAX_PATTERN) {
    return { ...state, valid: false, error: `Pattern exceeds the ${MAX_PATTERN}-character limit`, matches: [], tokens: [], trace: [] };
  }
  if (state.sample.length > MAX_SAMPLE) {
    return { ...state, valid: false, error: `Sample exceeds the ${MAX_SAMPLE}-character limit`, matches: [], tokens: [], trace: [] };
  }
  if (state.mode === "text" && !state.pattern) {
    return { ...state, valid: true, error: undefined, explanation: "Plain-text mode is active. Enable regular expression mode to evaluate a pattern.", matches: [], tokens: [], trace: [] };
  }
  let expression: RegExp;
  try {
    expression = new RegExp(state.pattern || state.sample, state.flags.includes("g") ? state.flags : `${state.flags}g`);
  } catch (error) {
    return { ...state, valid: false, error: error instanceof Error ? error.message : "Invalid regular expression", matches: [], tokens: [], trace: [] };
  }
  const started = Date.now();
  const matches: RegexWorkbenchState["matches"] = [];
  let result: RegExpExecArray | null;
  let guard = 0;
  while ((result = expression.exec(state.sample)) && guard < 200) {
    matches.push({ index: result.index, text: result[0], groups: { ...result.groups } });
    guard += 1;
    if (result[0] === "") expression.lastIndex += 1;
  }
  const elapsedMs = Date.now() - started;
  const risk = detectRisk(state.pattern);
  const tokens = tokenize(state.pattern);
  const trace = matches.slice(0, MAX_TRACE).map((match, index) => ({ step: index + 1, position: match.index, state: `matched ${JSON.stringify(match.text)}` }));
  const replacementPreview = state.sample.replace(expression, state.replacement);
  return {
    ...state,
    valid: true,
    error: undefined,
    explanation: explainPattern(state.pattern, tokens),
    tokens,
    matches,
    replacementPreview,
    performance: { elapsedMs, matchCount: matches.length, risk },
    trace
  };
}

function safeTest(state: RegexWorkbenchState, input: string): boolean {
  if (input.length > MAX_SAMPLE || !state.valid) return false;
  try { return new RegExp(state.pattern, state.flags).test(input); } catch { return false; }
}

function tokenize(pattern: string): RegexWorkbenchState["tokens"] {
  return [...pattern].map((text, index) => ({
    text,
    kind: "token",
    note: index === 0 ? "Pattern start" : "ECMAScript token"
  }));
}

function explainPattern(pattern: string, tokens: RegexWorkbenchState["tokens"]): string {
  if (!pattern) return "The pattern is empty.";
  const groups = (pattern.match(/\((?!\?)/g) || []).length;
  const anchors = (pattern.match(/\^|\$/g) || []).length;
  return `${tokens.length} token${tokens.length === 1 ? "" : "s"}; ${groups} capture group${groups === 1 ? "" : "s"}; ${anchors} anchor${anchors === 1 ? "" : "s"}.`;
}

function detectRisk(pattern: string): "low" | "medium" | "high" {
  if (/\([^)]*[+*][^)]*\)[+*]/.test(pattern) || /(?:\.\*|\.\+).*(?:\.\*|\.\+)/.test(pattern)) return "high";
  if (/[+*?].*[+*?]/.test(pattern)) return "medium";
  return "low";
}
