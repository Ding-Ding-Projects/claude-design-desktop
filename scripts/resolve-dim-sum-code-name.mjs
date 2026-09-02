import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = "https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json";
const releasesUrl = "https://api.github.com/repos/Ding-Ding-Projects/dim-sum-photos/releases?per_page=100";
const output = process.argv[process.argv.indexOf("--output") + 1] || "release-support/dim-sum-code-name.json";
const historyPath = process.argv[process.argv.indexOf("--history") + 1] || "release-support/release-history.json";

function namesFrom(value) {
  if (!value || typeof value !== "object") return [];
  const name = value.name;
  if (name && typeof name.en === "string" && typeof name.zhHant === "string") return [{ en: name.en, zhHant: name.zhHant, record: value }];
  return Object.values(value).flatMap(namesFrom);
}

const result = { schemaVersion: 1, available: false, source: catalogUrl, reason: "Public catalog could not be resolved." };
try {
  const [catalogResponse, releasesResponse] = await Promise.all([
    fetch(catalogUrl, { headers: { accept: "application/json" } }),
    fetch(releasesUrl, { headers: { accept: "application/vnd.github+json" } })
  ]);
  if (!catalogResponse.ok) throw new Error(`catalog HTTP ${catalogResponse.status}`);
  if (!releasesResponse.ok) throw new Error(`release index HTTP ${releasesResponse.status}`);
  const catalog = await catalogResponse.json();
  const releases = await releasesResponse.json();
  const publishedNames = new Set();
  for (const release of releases) {
    if (!/^catalog-v1/i.test(String(release.tag_name || ""))) continue;
    const body = String(release.body || "");
    for (const name of namesFrom(catalog)) {
      if (body.includes(name.en) && body.includes(name.zhHant)) publishedNames.add(`${name.en}\u0000${name.zhHant}`);
    }
    for (const asset of release.assets || []) {
      const lower = String(asset.name || "").toLowerCase();
      if (!/\.(png|jpg|jpeg|webp)$/.test(lower)) continue;
      for (const name of namesFrom(catalog)) {
        if (lower.includes(name.en.toLowerCase().replaceAll(" ", "-"))) publishedNames.add(`${name.en}\u0000${name.zhHant}`);
      }
    }
  }
  let used = new Set();
  try {
    const prior = JSON.parse(await readFile(historyPath, "utf8"));
    used = new Set((Array.isArray(prior) ? prior : prior.releases || []).map((entry) => `${entry.en}\u0000${entry.zhHant}`));
  } catch {
    // A missing history is the first release, not a reason to invent a name.
  }
  const candidate = namesFrom(catalog).find((name) => publishedNames.has(`${name.en}\u0000${name.zhHant}`) && !used.has(`${name.en}\u0000${name.zhHant}`));
  if (candidate) {
    result.available = true;
    result.name = candidate;
    result.photoSource = "https://github.com/Ding-Ding-Projects/dim-sum-photos/releases";
    result.reason = "Resolved from the public catalog and published catalog-v1 release assets."
  } else {
    result.reason = "No unused catalog record with a published catalog-v1 photo asset was found.";
  }
} catch (error) {
  result.reason = `Public catalog lookup unavailable: ${error instanceof Error ? error.message : String(error)}`;
}
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result));
