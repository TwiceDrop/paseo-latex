import assert from "node:assert/strict";
import test from "node:test";

import { collectAssets, uploadWithRetry } from "./upload-release-assets.mjs";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { releaseFiles, verifySums, verifyContent, publicationPatch } from "./latex/sync-cnb.mjs";

const noSleep = () => Promise.resolve();

test("retries a failing asset and keeps its siblings", async () => {
  const calls = [];
  const exitCodes = { "a.dmg": [1, 1, 0], "b.zip": [0] };

  const exitCode = await uploadWithRetry(
    { release: "rel", files: ["a.dmg", "b.zip"], repo: "getpaseo/paseo" },
    {
      sleep: noSleep,
      upload: ({ file }) => {
        calls.push(file);
        return exitCodes[file].shift();
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, ["a.dmg", "a.dmg", "a.dmg", "b.zip"]);
});

test("gives up after the attempt limit and reports failure", async () => {
  let calls = 0;

  const exitCode = await uploadWithRetry(
    { release: "rel", files: ["a.dmg", "b.zip"], repo: "getpaseo/paseo" },
    {
      attempts: 3,
      sleep: noSleep,
      upload: () => {
        calls += 1;
        return 1;
      },
    },
  );

  assert.equal(exitCode, 1);
  // Stops at the first unrecoverable file rather than attempting b.zip.
  assert.equal(calls, 3);
});

test("collects release files and skips manifests", () => {
  const files = collectAssets("/release", {
    readDir: () => ["Paseo.dmg", "beta-mac.yml", "Paseo.zip", "nested"],
    stat: (file) => ({ isFile: () => !file.endsWith("nested") }),
  });

  assert.deepEqual(files, ["/release/Paseo.dmg", "/release/Paseo.zip"]);
});

const releaseFixture = {
  tag_name: "latex-v0.15.3-r1",
  draft: false,
  prerelease: false,
  assets: [
    "paseo-latex-0.15.3-r1.apk",
    "Paseo-LaTeX-Setup-0.15.3-r1-x64.exe",
    "SHA256SUMS.txt",
  ].map((name) => ({ name, size: 3, digest: `sha256:${"a".repeat(64)}` })),
};

test("CNB mirrors only complete published personal releases with asset digests", () => {
  assert.deepEqual(releaseFiles(releaseFixture), releaseFixture.assets);
  for (const invalid of [
    { ...releaseFixture, draft: true },
    { ...releaseFixture, prerelease: true },
    { ...releaseFixture, tag_name: "v0.15.3" },
    { ...releaseFixture, assets: releaseFixture.assets.slice(1) },
    {
      ...releaseFixture,
      assets: releaseFixture.assets.map((asset) => ({ ...asset, digest: null })),
    },
  ]) {
    assert.throws(() => releaseFiles(invalid));
  }
});

test("CNB checksum manifests must agree with both GitHub installer digests", () => {
  const assets = releaseFiles(releaseFixture);
  const sums = assets
    .slice(0, 2)
    .map((asset) => `${asset.digest.slice(7)}  ${asset.name}`)
    .join("\n");
  assert.doesNotThrow(() => verifySums(sums, assets));
  assert.throws(() => verifySums(sums.replace(/^a/, "b"), assets), /checksum/i);
  assert.throws(() => verifySums(sums.split("\n")[0], assets), /checksum/i);
  assert.throws(() => verifySums(`${sums}\n${sums}`, assets), /checksum/i);
});

test("CNB verifies streamed bytes, including truncated or changed downloads", async () => {
  const expected = {
    name: "installer.apk",
    size: 3,
    digest: `sha256:${createHash("sha256").update("abc").digest("hex")}`,
  };
  await verifyContent(Readable.from([Buffer.from("a"), Buffer.from("bc")]), expected);
  await assert.rejects(verifyContent(Readable.from([Buffer.from("ab")]), expected), /mismatch/);
  await assert.rejects(verifyContent(Readable.from([Buffer.from("abd")]), expected), /mismatch/);
});

test("CNB publication keeps tags immutable and does not promote an archived release", () => {
  const commit = "b".repeat(40);
  const target = { tag_name: releaseFixture.tag_name, tag_commitish: commit };
  assert.equal(
    publicationPatch(releaseFixture, target, commit, commit, releaseFixture.tag_name).make_latest,
    "true",
  );
  assert.equal(
    publicationPatch(releaseFixture, target, commit, commit, "latex-v0.15.4-r1").make_latest,
    "false",
  );
  assert.throws(
    () =>
      publicationPatch(
        releaseFixture,
        { ...target, tag_commitish: "c".repeat(40) },
        commit,
        commit,
        releaseFixture.tag_name,
      ),
    /source commit/,
  );
  const annotated = { ...target, tag_commitish: `refs/tags/${releaseFixture.tag_name}` };
  assert.equal(
    publicationPatch(releaseFixture, annotated, commit, commit, releaseFixture.tag_name).draft,
    false,
  );
  assert.throws(
    () =>
      publicationPatch(releaseFixture, annotated, commit, "c".repeat(40), releaseFixture.tag_name),
    /source commit/,
  );
});
