import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const rows = new Map([
  ["source", []],
  ["tests", []],
  ["styles-markup", []],
  ["generated", []],
  ["documentation", []],
  ["tooling", []],
  ["other", []]
]);

function category(file) {
  const normalized = file.replaceAll("\\", "/");
  if (/^(test|tests|packages\/[^/]+\/test|packages\/[^/]+\/tests)\//.test(normalized) || /\.(test|spec)\.[^.]+$/.test(normalized)) return "tests";
  if (/^(dist|build|coverage|node_modules)\//.test(normalized)) return "generated";
  if (/\.(css|scss|sass|less|html|htm|svg)$/.test(normalized)) return "styles-markup";
  if (/^(docs|README|CHANGELOG|ROADMAP|HANDOFF|SECURITY|CONTRIBUTING|CODE_OF_CONDUCT|LICENSE)/i.test(normalized)) return "documentation";
  if (/^(scripts|build|\.github)\//.test(normalized) || /\.(bat|ps1|mjs|cjs|yml|yaml)$/.test(normalized)) return "tooling";
  if (/\.(ts|tsx|js|jsx|json)$/.test(normalized) || normalized.startsWith("packages/")) return "source";
  return "other";
}

function count(file) {
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
const project = table.filter((row) => !["generated"].includes(row.category));
const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  command: "node scripts/line-count.mjs",
  exclusions: ["node_modules", "build output", "dependency lockfiles", "vendored third-party trees"],
  rows: table,
  projectTotal: {
    total: project.reduce((sum, row) => sum + row.total, 0),
    nonBlank: project.reduce((sum, row) => sum + row.nonBlank, 0)
  },
  repositoryTotal: {
    total: table.reduce((sum, row) => sum + row.total, 0),
    nonBlank: table.reduce((sum, row) => sum + row.nonBlank, 0)
  }
};
if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log("Category | Files | Total lines | Non-blank lines");
  console.log("--- | ---: | ---: | ---:");
  for (const row of table) console.log(`${row.category} | ${row.files} | ${row.total} | ${row.nonBlank}`);
  console.log(`Project total |  | ${result.projectTotal.total} | ${result.projectTotal.nonBlank}`);
  console.log(`Repository total |  | ${result.repositoryTotal.total} | ${result.repositoryTotal.nonBlank}`);
  console.log("Excluded from project total: node_modules, build output, dependency lockfiles, and vendored third-party trees.");
}
