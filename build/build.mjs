import { buildDesktop, buildSite, cleanDist, copyCodexRuntime, copyDocumentation, copyStaticAssets, verifyBuildOutputs } from "./esbuild.config.mjs";

const mode = process.argv.includes("--dev") ? "development" : "production";
cleanDist();
copyStaticAssets();
copyDocumentation();
copyCodexRuntime();
await Promise.all([buildDesktop({ mode }), buildSite({ mode })]);
verifyBuildOutputs();
console.log(`Built Claude Design Desktop and its public documentation site in ${mode} mode.`);
