import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { checkPatches, exportPatches } from "./patches.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "paseo-patches-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, "repo");
  mkdirSync(cwd);
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "upstream");
  git("config", "user.name", "Patch Test");
  git("config", "user.email", "patch-test@example.invalid");
  const write = (name, value) => writeFileSync(path.join(cwd, name), value);
  write("shared.txt", "upstream\n");
  write("removed.txt", "remove me\n");
  git("add", ".");
  git("commit", "-m", "base");
  const base = git("rev-parse", "HEAD");
  git("checkout", "-b", "personal");
  mkdirSync(path.join(cwd, "scripts/latex"), { recursive: true });
  write(
    "scripts/latex/patch-catalog.json",
    JSON.stringify({
      upstream: { commit: base },
      features: [{ id: "example", paths: ["shared.txt"] }],
    }),
  );
  write("shared.txt", "personal\n");
  write("asset.bin", Buffer.from([0, 255, 0, 128, 34]));
  rmSync(path.join(cwd, "removed.txt"));
  git("add", "-A");
  git("commit", "-m", "personal patch");
  const bundle = path.join(root, "export");
  const manifest = exportPatches({ cwd, out: bundle });
  return { cwd, bundle, base, manifest, git, write };
}

test("export replays additions, deletions and binary assets to exactly the committed tree", (t) => {
  const f = fixture(t);
  const result = checkPatches({ ...f, ref: f.base });
  assert.equal(result.ok, true);
  assert.equal(result.tree, f.manifest.tree);
  assert.throws(() => exportPatches({ cwd: f.cwd, out: f.bundle }), /EEXIST/);
});

test("preflight preserves new upstream files and leaves a dirty worktree and real index untouched", (t) => {
  const f = fixture(t);
  f.git("checkout", "upstream");
  f.write("upstream-new.txt", "new official feature\n");
  f.git("add", ".");
  f.git("commit", "-m", "upstream addition");
  f.write("shared.txt", "staged user edit\n");
  f.git("add", ".");
  f.write("shared.txt", "unstaged user edit\n");
  f.write("untracked.txt", "keep\n");
  const before = f.git("status", "--porcelain=v1");
  const index = readFileSync(path.join(f.cwd, ".git/index"));
  const result = checkPatches({ ...f, ref: "HEAD" });
  assert.equal(result.ok, true);
  assert.equal(f.git("show", `${result.tree}:upstream-new.txt`), "new official feature");
  assert.equal(f.git("show", `${result.tree}:shared.txt`), "personal");
  assert.equal(f.git("status", "--porcelain=v1"), before);
  assert.deepEqual(readFileSync(path.join(f.cwd, ".git/index")), index);
  assert.equal(readFileSync(path.join(f.cwd, "shared.txt"), "utf8"), "unstaged user edit\n");
});

test("reports real upstream conflicts and affected features without switching the checkout", (t) => {
  const f = fixture(t);
  f.git("checkout", "upstream");
  f.write("shared.txt", "upstream changed the same line\n");
  f.git("add", ".");
  f.git("commit", "-m", "conflict");
  const result = checkPatches({ ...f, ref: "HEAD" });
  assert.equal(result.ok, false);
  assert.deepEqual(result.conflicts, ["shared.txt"]);
  assert.deepEqual(result.affectedFeatures, ["example"]);
  assert.equal(f.git("status", "--porcelain=v1"), "");
  assert.equal(f.git("branch", "--show-current"), "upstream");
});

test("rejects a damaged or edited patch before applying it", (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.bundle, "personal.patch"), "damaged\n");
  assert.throws(() => checkPatches({ ...f, ref: f.base }), /SHA-256/);
  assert.equal(f.git("status", "--porcelain=v1"), "");
});
