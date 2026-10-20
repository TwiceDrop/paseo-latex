import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// npm ci --ignore-scripts plus our targeted patches skips dependency postinstall.
// Restore Android's pinned grammar sources without downloading iOS frameworks.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(path.join(repoRoot, "packages/app/package.json"));
const root = path.dirname(require.resolve("react-native-enriched-markdown/package.json"));
const result = spawnSync(
  process.execPath,
  [
    path.join(root, "vendor-grammars.mjs"),
    "--from-npm",
    "--vendor-dir",
    path.join(root, "cpp/highlight/vendor"),
    "--manifest",
    path.join(root, "cpp/highlight/grammar-versions.json"),
  ],
  { cwd: repoRoot, stdio: "inherit", windowsHide: true },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
