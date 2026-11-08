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

export async function prepareWindowsTools({
  directory,
  cache,
  sevenZip = require("7zip-bin").path7za,
}) {
  await fs.mkdir(directory, { recursive: true });
  const extract = async (archive, destination) => {
    await fs.mkdir(destination, { recursive: true });
    const result = spawnSync(
      sevenZip,
      ["x", "-y", "-bd", "-bso0", "-bsp0", "-xr!darwin", "-xr!linux", archive, `-o${destination}`],
      { stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Unable to extract ${archive}`);
  };
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
  await extract(archive, electronDist);
  // Match electron-builder's normal distribution cleanup for a custom local dist.
  await fs.rm(path.join(electronDist, "resources/default_app.asar"), { force: true });
  await fs.rm(path.join(electronDist, "version"), { force: true });

  // Match electron-builder 26.8.1 / app-builder's pinned tools and cache keys.
  // Checksums come from app-builder's tool.go and electron-builder's nsisUtil.js.
  const tools = [
    [
      "winCodeSign-2.6.0",
      "winCodeSign-2.6.0",
      "6LQI2d9BPC3Xs0ZoTQe1o3tPiA28c7+PY69Q9i/pD8lY45psMtHuLwv3vRckiVr3Zx1cbNyLlBR8STwCdcHwtA==",
    ],
    [
      "nsis-3.0.4.1",
      "nsis-3.0.4.1-nsis-3.0.4.1",
      "VKMiizYdmNdJOWpRGz4trl4lD++BvYP2irAXpMilheUP0pc93iKlWAoP843Vlraj8YG19CVn0j+dCo/hURz9+Q==",
    ],
    [
      "nsis-resources-3.4.1",
      "nsis-resources-3.4.1-nsis-resources-3.4.1",
      "Dqd6g+2buwwvoG1Vyf6BHR1b+25QMmPcwZx40atOT57gH27rkjOei1L0JTldxZu4NFoEmW4kJgZ3DlSWVON3+Q==",
    ],
  ];
  for (const [name, cacheKey, sha512] of tools) {
    console.log(`[windows-latex] Preparing verified ${name}`);
    const file = path.join(directory, `${name}.7z`);
    await download(
      `https://github.com/electron-userland/electron-builder-binaries/releases/download/${name}/${name}.7z`,
      file,
      sha512,
    );
    await extract(file, path.join(cache, cacheKey.split("-")[0], cacheKey));
  }
  return electronDist;
}
