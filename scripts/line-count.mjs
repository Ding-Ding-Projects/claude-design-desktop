import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter((file) => !/^(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(path.basename(file)));

const rows = new Map([
  ["source", []],
  ["tests", []],
  ["styles-markup", []],
  ["binary-assets", []],
  ["generated", []],
  ["documentation", []],
  ["tooling", []],
  ["other", []]
]);

function category(file) {
  const normalized = file.replaceAll("\\", "/");
  if (/\.(png|jpe?g|gif|webp|webm|ico|zip|7z|nupkg|exe|dll|woff2?|ttf|otf)$/i.test(normalized)) return "binary-assets";
  if (/^(test|tests|packages\/[^/]+\/test|packages\/[^/]+\/tests)\//.test(normalized) || /\.(test|spec)\.[^.]+$/.test(normalized)) return "tests";
  if (/^(dist|coverage|node_modules)\//.test(normalized)) return "generated";
  if (/\.(css|scss|sass|less|html|htm|svg)$/.test(normalized)) return "styles-markup";
  if (/^(docs|README|CHANGELOG|ROADMAP|HANDOFF|SECURITY|CONTRIBUTING|CODE_OF_CONDUCT|LICENSE)/i.test(normalized)) return "documentation";
  if (/^(scripts|build|\.github)\//.test(normalized) || /\.(bat|ps1|mjs|cjs|yml|yaml)$/.test(normalized)) return "tooling";
  if (/\.(ts|tsx|js|jsx|json)$/.test(normalized) || normalized.startsWith("packages/")) return "source";
  return "other";
}

function count(file) {
  if (category(file) === "binary-assets") return { total: 0, nonBlank: 0 };
  const bytes = readFileSync(path.join(root, file));
  if (bytes.length === 0) return { total: 0, nonBlank: 0 };
  const text = bytes.toString("utf8").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  return { total: lines.length, nonBlank: lines.filter((line) => line.trim().length > 0).length };
}

for (const file of files) rows.get(category(file)).push({ file, ...count(file) });
const table = [...rows.entries()].map(([name, entries]) => ({
  category: name,
  files: entries.length,
  total: entries.reduce((sum, entry) => sum + entry.total, 0),
  nonBlank: entries.reduce((sum, entry) => sum + entry.nonBlank, 0)
}));
const project = table.filter((row) => !["generated", "binary-assets"].includes(row.category));
const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  command: "node scripts/line-count.mjs",
  exclusions: ["node_modules", "build output", "binary assets", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "vendored third-party trees"],
  rows: table,
  projectTotal: {
    total: project.reduce((sum, row) => sum + row.total, 0),
    nonBlank: project.reduce((sum, row) => sum + row.nonBlank, 0)
  },
  repositoryTotal: {
    total: table.reduce((sum, row) => sum + row.total, 0),
    nonBlank: table.reduce((sum, row) => sum + row.nonBlank, 0)
  },
  attribution: blameAttribution(files.filter((file) => !["generated", "binary-assets"].includes(category(file))))
};
if (result.attribution.countedLines !== result.projectTotal.total) {
  throw new Error(`Attribution arithmetic mismatch: ${result.attribution.countedLines} blamed lines versus ${result.projectTotal.total} project lines. Per-file mismatches: ${JSON.stringify(result.attribution.mismatches)}.`);
}
const estimatedHours = result.projectTotal.nonBlank / 60 * 1.5;
result.humanEffortEstimate = {
  basis: `${result.projectTotal.nonBlank} surviving non-blank project lines / 60 lines per hour × 1.5 complexity multiplier`,
  hours: Number(estimatedHours.toFixed(1)),
  statement: "Estimate only. No person was timed writing this project."
};
if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log("Category | Files | Total lines | Non-blank lines");
  console.log("--- | ---: | ---: | ---:");
  for (const row of table) console.log(`${row.category} | ${row.files} | ${row.total} | ${row.nonBlank}`);
  console.log(`Project total |  | ${result.projectTotal.total} | ${result.projectTotal.nonBlank}`);
  console.log(`Repository total |  | ${result.repositoryTotal.total} | ${result.repositoryTotal.nonBlank}`);
  console.log(`Surviving project lines attributed to agents |  | ${result.attribution.agentLines} | `);
  console.log(`Surviving project lines attributed to people |  | ${result.attribution.personLines} | `);
  console.log(`Estimated human writing time |  | ${result.humanEffortEstimate.hours} hours | estimate only`);
  console.log(`Estimate method: ${result.humanEffortEstimate.basis}.`);
  console.log("Excluded from project total: node_modules, build output, binary assets, dependency lockfiles, and vendored third-party trees.");
}

function blameAttribution(paths) {
  const people = new Map();
  const fileCounts = [];
  for (const file of paths) {
    const source = execFileSync("git", ["blame", "--line-porcelain", "HEAD", "--", file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    let author = "unknown";
    let blamedLines = 0;
    for (const line of source.split("\n")) {
      if (line.startsWith("author ")) author = line.slice("author ".length).trim();
      else if (line.startsWith("\t")) { people.set(author, (people.get(author) || 0) + 1); blamedLines += 1; }
    }
    fileCounts.push({ file, counted: count(file).total, blamed: blamedLines });
  }
  const rows = [...people.entries()].map(([author, lines]) => ({ author, lines, kind: /claude|automation|bot|agent/i.test(author) ? "agent" : "person" }));
  return {
    rows,
    agentLines: rows.filter((row) => row.kind === "agent").reduce((sum, row) => sum + row.lines, 0),
    personLines: rows.filter((row) => row.kind === "person").reduce((sum, row) => sum + row.lines, 0),
    countedLines: rows.reduce((sum, row) => sum + row.lines, 0),
    mismatches: fileCounts.filter((entry) => entry.counted !== entry.blamed),
    rule: "Surviving lines are attributed from git blame at HEAD; commits by an automation identity are counted as agent-written."
  };
}
