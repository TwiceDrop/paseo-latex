import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function personalVersion(tag) {
  const match = /^latex-v(\d+\.\d+\.\d+)-r([1-9]\d?)$/.exec(tag);
  if (!match) throw new Error("Invalid personal release tag");
  return { version: match[1], revision: Number(match[2]) };
}

export function needsWindowsUpdateManifest(tag) {
  const { version, revision } = personalVersion(tag);
  const [major, minor, patch] = version.split(".").map(Number);
  return major > 0 || minor > 15 || (minor === 15 && (patch > 3 || (patch === 3 && revision >= 2)));
}

export function windowsUpdateManifest(tag, installer, releaseDate = new Date().toISOString()) {
  const { version, revision } = personalVersion(tag);
  if (!(installer.size > 0) || !/^[A-Za-z0-9+/]{86}==$/.test(installer.sha512)) {
    throw new Error("A verified Windows installer size and SHA-512 are required");
  }
  const url = `https://cnb.cool/twicedrop/paseo-latex/-/releases/download/${tag}/Paseo-LaTeX-Setup-${version}-r${revision}-x64.exe`;
  return {
    version: `${version}-latex.${revision}`,
    files: [{ url, sha512: installer.sha512, size: installer.size }],
    path: url,
    sha512: installer.sha512,
    releaseDate,
  };
}

export function verifyWindowsUpdateManifest(text, tag, installer) {
  const actual = JSON.parse(text);
  const expected = windowsUpdateManifest(tag, installer);
  if (
    actual.version !== expected.version ||
    actual.path !== expected.path ||
    actual.sha512 !== expected.sha512 ||
    actual.files?.length !== 1 ||
    actual.files[0].url !== expected.path ||
    actual.files[0].sha512 !== expected.sha512 ||
    actual.files[0].size !== installer.size ||
    !Number.isFinite(Date.parse(actual.releaseDate))
  ) {
    throw new Error("Windows update manifest does not match the versioned CNB installer");
  }
}

export async function hashFile(file, algorithm, encoding = "hex") {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest(encoding);
}

export async function writeReleaseMetadata(directory, tag) {
  const { version, revision } = personalVersion(tag);
  const names = [
    `paseo-latex-${version}-r${revision}.apk`,
    `Paseo-LaTeX-Setup-${version}-r${revision}-x64.exe`,
  ];
  const exe = join(directory, names[1]);
  const installer = {
    size: (await stat(exe)).size,
    sha512: await hashFile(exe, "sha512", "base64"),
  };
  // JSON is valid YAML, keeping the CI publisher and mirror dependency-free.
  const manifest = JSON.stringify(windowsUpdateManifest(tag, installer), null, 2) + "\n";
  await writeFile(join(directory, "latest.yml"), manifest, { flag: "wx" });
  verifyWindowsUpdateManifest(
    await readFile(join(directory, "latest.yml"), "utf8"),
    tag,
    installer,
  );
  names.push("latest.yml");
  const sums = [];
  for (const name of names)
    sums.push(`${await hashFile(join(directory, name), "sha256")}  ${name}`);
  await writeFile(join(directory, "SHA256SUMS.txt"), sums.join("\n") + "\n", { flag: "wx" });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, tag] = process.argv.slice(2);
  if (!directory || !tag) throw new Error("Usage: release-manifest.mjs <directory> <personal-tag>");
  await writeReleaseMetadata(directory, tag);
}
