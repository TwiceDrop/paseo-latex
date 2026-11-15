import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const catalogPath = "scripts/latex/patch-catalog.json";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function git(cwd, args, options = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
    ...options,
  });
}
function commit(cwd, ref) {
  return git(cwd, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]).trim();
}

/** Export committed source, including binary/generated assets, independently of merge history. */
export function exportPatches({ cwd = repoRoot, out, base, head = "HEAD" }) {
  const catalog = JSON.parse(git(cwd, ["show", `${commit(cwd, head)}:${catalogPath}`]));
  const baseCommit = commit(cwd, base ?? catalog.upstream.commit);
  const headCommit = commit(cwd, head);
  git(cwd, ["merge-base", "--is-ancestor", baseCommit, headCommit]);
  const patch = git(
    cwd,
    [
      "diff",
      "--binary",
      "--full-index",
      "--no-ext-diff",
      "--no-textconv",
      "--no-renames",
      baseCommit,
      headCommit,
    ],
    { encoding: "buffer" },
  );
  const paths = git(cwd, ["diff", "--name-only", "-z", "--no-renames", baseCommit, headCommit])
    .split("\0")
    .filter(Boolean);
  const manifest = {
    format: 1,
    base: baseCommit,
    head: headCommit,
    tree: git(cwd, ["rev-parse", `${headCommit}^{tree}`]).trim(),
    sha256: digest(patch),
    features: catalog.features.map((feature) => ({
      id: feature.id,
      contract: feature.contract,
      paths: paths.filter((name) => feature.paths.some((prefix) => name.startsWith(prefix))),
    })),
    unclassified: paths.filter(
      (name) =>
        !catalog.features.some((feature) =>
          feature.paths.some((prefix) => name.startsWith(prefix)),
        ),
    ),
    paths,
  };
  // Never overwrite another export or accept a partially updated bundle.
  mkdirSync(out);
  writeFileSync(path.join(out, "personal.patch"), patch);
  writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Use an isolated Git index: no checkout, hooks, branch, working-tree or real-index changes. */
export function checkPatches({ cwd = repoRoot, bundle, ref }) {
  const manifest = JSON.parse(readFileSync(path.join(bundle, "manifest.json"), "utf8"));
  const patch = readFileSync(path.join(bundle, "personal.patch"));
  if (manifest.format !== 1 || digest(patch) !== manifest.sha256) {
    throw new Error("Invalid patch bundle or SHA-256 mismatch");
  }
  const target = commit(cwd, ref ?? manifest.base);
  const base = commit(cwd, manifest.base);
  const directory = mkdtempSync(path.join(tmpdir(), "paseo-patch-index-"));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(directory, "index") };
  try {
    git(cwd, ["read-tree", target], { env });
    const applied = spawnSync("git", ["apply", "--cached", "--3way", "--whitespace=nowarn", "-"], {
      cwd,
      env,
      input: patch,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      windowsHide: true,
    });
    if (applied.error) throw applied.error;
    const conflicts = [
      ...new Set(
        git(cwd, ["diff", "--name-only", "--diff-filter=U", "--cached", "-z"], { env })
          .split("\0")
          .filter(Boolean),
      ),
    ];
    const changed = git(cwd, ["diff", "--name-only", "--no-renames", "-z", base, target])
      .split("\0")
      .filter(Boolean);
    const overlaps = changed.filter((name) => manifest.paths.includes(name));
    const tree = applied.status === 0 ? git(cwd, ["write-tree"], { env }).trim() : null;
    // Reapplying onto the recorded base must reproduce *every* tracked file exactly.
    const exact = target !== base || tree === manifest.tree;
    let diagnostic = exact ? "" : "Reconstructed tree differs from exported source";
    if (applied.status !== 0) diagnostic = applied.stderr.trim();
    return {
      ok: applied.status === 0 && exact,
      target,
      tree,
      overlaps,
      conflicts,
      diagnostic,
      affectedFeatures: manifest.features
        .filter((feature) => feature.paths.some((name) => overlaps.includes(name)))
        .map((feature) => feature.id),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string" },
      base: { type: "string" },
      head: { type: "string" },
      bundle: { type: "string" },
      ref: { type: "string" },
    },
  });
  if (positionals[0] === "export" && values.out) {
    const result = exportPatches({ ...values, out: path.resolve(values.out) });
    console.log(
      `Exported ${result.paths.length} paths: ${result.base} -> ${result.head}\n${path.resolve(values.out)}`,
    );
  } else if (positionals[0] === "check" && values.bundle) {
    const result = checkPatches({ bundle: path.resolve(values.bundle), ref: values.ref });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else {
    throw new Error(
      "Use export --out <new-directory> [--base <ref>] [--head <ref>], or check --bundle <directory> [--ref <upstream-ref>]",
    );
  }
}
