import { parseArgs } from "node:util";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkPatches, exportPatches } from "./patches.mjs";

const { values } = parseArgs({
  options: {
    ref: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});
const ref = values.ref;
const validRef = ref === "upstream/main" || /^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(ref ?? "");
if (!validRef) throw new Error("Specify --ref v0.x.y or --ref upstream/main");
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", windowsHide: true }).trim();
}
function run({ command, args, cwd = repoRoot }) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    windowsHide: true,
    shell: process.platform === "win32" && command === "npm",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (git(["branch", "--show-current"]) !== "paseo-latex") {
  throw new Error("Switch to the paseo-latex maintenance branch before updating");
}
if (git(["status", "--porcelain"])) throw new Error("Commit your local changes before updating");
const upstream = git(["remote", "get-url", "upstream"]);
if (upstream !== "https://github.com/getpaseo/paseo.git") {
  throw new Error("The upstream remote must point to the official getpaseo/paseo repository");
}
if (!values["dry-run"]) run({ command: "git", args: ["fetch", "upstream", "--tags"] });
const target = git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
process.stdout.write(
  `LaTeX maintenance branch: ${git(["rev-parse", "--short", "HEAD"])}\nUpstream target: ${ref} (${target})\n`,
);
const temporary = mkdtempSync(path.join(tmpdir(), "paseo-upgrade-"));
try {
  const bundle = path.join(temporary, "patches");
  // Also support resuming after a reviewed, manually resolved upstream merge.
  const merged = spawnSync("git", ["merge-base", "--is-ancestor", target, "HEAD"], {
    cwd: repoRoot,
    windowsHide: true,
  });
  if (merged.error) throw merged.error;
  if (merged.status !== 0 && merged.status !== 1)
    throw new Error("Unable to inspect upstream ancestry");
  exportPatches({ out: bundle, base: merged.status === 0 ? target : undefined });
  const result = checkPatches({ bundle, ref: target });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok)
    throw new Error(
      "Patch preflight found conflicts; resolve the upstream merge in a review branch before continuing.",
    );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
if (!values["dry-run"]) {
  run({ command: "git", args: ["merge", "--no-edit", target] });
  run({ command: "npm", args: ["ci", "--ignore-scripts", "--no-audit", "--no-fund"] });
  run({ command: "npm", args: ["run", "postinstall"] });
  run({ command: "npm", args: ["run", "latex:prepare"] });
  run({ command: "npm", args: ["run", "typecheck", "--workspace=@getpaseo/app"] });
  run({ command: "npm", args: ["run", "typecheck", "--workspace=@getpaseo/client"] });
  run({ command: "npm", args: ["run", "lint"] });
  run({ command: "npm", args: ["run", "latex:verify", "--", "--suite", "unit"] });
  run({ command: "git", args: ["diff", "--check"] });
  const catalogFile = path.join(repoRoot, "scripts/latex/patch-catalog.json");
  const catalog = JSON.parse(readFileSync(catalogFile, "utf8"));
  catalog.upstream = { tag: ref, commit: target };
  writeFileSync(catalogFile, `${JSON.stringify(catalog, null, 2)}\n`);
  process.stdout.write(
    "Upstream merge and unit checks completed. Commit the refreshed patch catalog/assets; run latex:verify browser/e2e and platform builds before release.\n",
  );
}
