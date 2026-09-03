import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = "https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json";
const releasesUrl = "https://api.github.com/repos/Ding-Ding-Projects/dim-sum-photos/releases?per_page=100";
const output = process.argv[process.argv.indexOf("--output") + 1] || "release-support/dim-sum-code-name.json";
const historyPath = process.argv[process.argv.indexOf("--history") + 1] || "release-support/release-history.json";
const projectReleasesUrl = process.env.GITHUB_REPOSITORY ? `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/releases?per_page=100` : null;

function recordsFrom(value) {
  if (!value || typeof value !== "object") return [];
  if (value.name && typeof value.name.en === "string" && typeof value.name.zhHant === "string") return [value];
  return Object.values(value).flatMap(recordsFrom);
}

function slug(value) {
  return value.toLowerCase().normalize("NFKD").replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
}

function usedNames(value) {
  const entries = Array.isArray(value) ? value : value?.releases || [];
  return new Set(entries.filter((entry) => entry && typeof entry.en === "string" && typeof entry.zhHant === "string").map((entry) => `${entry.en}\u0000${entry.zhHant}`));
}

const result = { schemaVersion: 1, available: false, source: catalogUrl, reason: "Public catalog could not be resolved." };
try {
  const [catalogResponse, releasesResponse, projectReleasesResponse] = await Promise.all([
    fetch(catalogUrl, { signal: AbortSignal.timeout(20_000), headers: { accept: "application/json" } }),
    fetch(releasesUrl, { signal: AbortSignal.timeout(20_000), headers: { accept: "application/vnd.github+json" } }),
    projectReleasesUrl ? fetch(projectReleasesUrl, { signal: AbortSignal.timeout(20_000), headers: { accept: "application/vnd.github+json" } }) : null
  ]);
  if (!catalogResponse.ok) throw new Error(`catalog HTTP ${catalogResponse.status}`);
  if (!releasesResponse.ok) throw new Error(`release index HTTP ${releasesResponse.status}`);
  const records = recordsFrom(await catalogResponse.json());
  const releases = await releasesResponse.json();
  const used = await (async () => {
    let names = new Set();
    try { names = usedNames(JSON.parse(await readFile(historyPath, "utf8"))); } catch { /* first release */ }
    if (projectReleasesResponse?.ok) {
      const projectReleases = await projectReleasesResponse.json();
      for (const release of projectReleases) {
        const match = String(release.body || "").match(/Dim-sum code name:\s*([^\n]+?)\s*·\s*(\S[^\n]*)/i);
        if (match) names.add(`${match[1].trim()}\u0000${match[2].trim()}`);
      }
    }
    return names;
  })();
  const publishedAssets = releases.filter((release) => /^catalog-v1/i.test(String(release.tag_name || ""))).flatMap((release) => release.assets || []).filter((asset) => /\.(png|jpg|jpeg|webp)$/i.test(String(asset.name || "")) && /^https:\/\//i.test(String(asset.browser_download_url || "")));
  for (const record of records) {
    const key = `${record.name.en}\u0000${record.name.zhHant}`;
    if (used.has(key)) continue;
    const englishSlug = slug(record.name.en);
    const asset = publishedAssets.find((candidate) => slug(candidate.name).includes(englishSlug) || String(candidate.name).toLowerCase().includes(englishSlug));
    if (!asset) continue;
    const photoResponse = await fetch(asset.browser_download_url, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
    const contentType = photoResponse.headers.get("content-type") || "";
    if (!photoResponse.ok || (!contentType.startsWith("image/") && !/\.(png|jpg|jpeg|webp)$/i.test(asset.name))) continue;
    result.available = true;
    result.name = record.name;
    result.photoUrl = asset.browser_download_url;
    result.photoAsset = asset.name;
    result.releaseTag = releases.find((release) => (release.assets || []).some((candidate) => candidate.browser_download_url === asset.browser_download_url))?.tag_name;
    result.reason = "Resolved from the public catalog and verified with a direct HEAD request to a published catalog-v1 image asset.";
    break;
  }
  if (!result.available) result.reason = "No unused catalog record with a directly verified published catalog-v1 image asset was found.";
} catch (error) {
  result.reason = `Public catalog lookup unavailable: ${error instanceof Error ? error.message : String(error)}`;
}
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result));
