import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { runWithRetry } from "../npm-retry.mjs";

const require = createRequire(import.meta.url);

async function download(url, destination, checksum, algorithm = "sha512", encoding = "base64") {
  const digest = (bytes) => createHash(algorithm).update(bytes).digest(encoding);
  if (checksum) {
    try {
      const bytes = await fs.readFile(destination);
      if (digest(bytes) === checksum) return bytes;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const match =
    /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\/([^/]+)\/([^/]+)$/.exec(url);
  if (!match) throw new Error(`Unsupported build-tool source: ${url}`);
  const [, repo, tag, asset] = match;
  let bytes;
  const status = await runWithRetry([], {
    attempts: 5,
    backoffMs: 10_000,
    run: async () => {
      try {
        // Use GitHub's release-asset API instead of repeatedly requesting a
        // failing browser-download URL. Archives are verified before extraction.
        const result = spawnSync(
          "gh",
          [
            "release",
            "download",
            tag,
            "--repo",
            repo,
            "--pattern",
            asset,
            "--output",
            destination,
            "--clobber",
          ],
          { stdio: "inherit", timeout: 180_000 },
        );
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`Official asset download failed: ${url}`);
        bytes = await fs.readFile(destination);
        if (checksum && digest(bytes) !== checksum) throw new Error(`Checksum mismatch: ${url}`);
        return 0;
      } catch (error) {
        console.error(error);
        return 1;
      }
    },
  });
  if (status !== 0) throw new Error(`Unable to prepare verified build tool: ${url}`);
  return bytes;
}

export async function prepareWindowsTools({ directory, cache }) {
  await fs.mkdir(directory, { recursive: true });
  // This is only the Electron ZIP. electron-builder owns extraction of its toolsets below.
  // Keep the dependency explicit: electron-builder 26.18 no longer installs 7zip-bin.
  const extract = require("extract-zip");
  const version = require("electron/package.json").version;
  const base = `https://github.com/electron/electron/releases/download/v${version}`;
  const fileName = `electron-v${version}-win32-x64.zip`;
  const sums = await download(
    `${base}/SHASUMS256.txt`,
    path.join(directory, `SHASUMS256-${version}.txt`),
  );
  const checksum = sums
    .toString()
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .find((fields) => fields[1]?.replace(/^\*/, "") === fileName)?.[0];
  if (!checksum || !/^[a-f0-9]{64}$/.test(checksum))
    throw new Error("Official Electron SHA-256 is missing");
  const archive = path.join(directory, fileName);
  console.log(`[windows-latex] Preparing official Electron ${version} (SHA-256 ${checksum})`);
  await download(`${base}/${fileName}`, archive, checksum, "sha256", "hex");
  const electronDist = path.join(directory, `electron-${version}`);
  await extract(archive, { dir: path.resolve(electronDist) });
  // Match electron-builder's normal distribution cleanup for a custom local dist.
  await fs.rm(path.join(electronDist, "resources/default_app.asar"), { force: true });
  await fs.rm(path.join(electronDist, "resources/app"), { recursive: true, force: true });
  await fs.rm(path.join(electronDist, "version"), { force: true });

  // Seed electron-builder 26.18's verified archive cache. It owns extraction and
  // cache-state metadata; the new 7zip toolset is needed to unpack the legacy NSIS tools.
  // SHA-256 values come from its toolsets/windows.js and toolsets/7zip.js.
  const tools = [
    [
      "winCodeSign-2.6.0",
      "winCodeSign-2.6.0.7z",
      "cdaec7154dda7cc31f88d886e2489379a0625a737d610b5ae7f62a12f16743a4",
    ],
    [
      "nsis-3.0.4.1",
      "nsis-3.0.4.1.7z",
      "9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa",
    ],
    [
      "nsis-resources-3.4.1",
      "nsis-resources-3.4.1.7z",
      "593a9a92ef958321293ac6a2ee61e64bf1bd543142a5bd6b3d310709cc924103",
    ],
    [
      "7zip@1.0.0",
      "7zip-win-x64.tar.gz",
      "be071f15bd6da2f78fe81c6ddef2009b0c4d8a51f36b780cb806c7e6df95e1b3",
    ],
  ];
  for (const [release, filename, sha256] of tools) {
    console.log(`[windows-latex] Preparing verified ${filename}`);
    const file = path.join(directory, filename);
    await download(
      `https://github.com/electron-userland/electron-builder-binaries/releases/download/${release}/${filename}`,
      file,
      sha256,
      "sha256",
      "hex",
    );
    const archiveDirectory = path.join(cache, release);
    await fs.mkdir(archiveDirectory, { recursive: true });
    await fs.copyFile(file, path.join(archiveDirectory, filename));
  }
  return electronDist;
}
