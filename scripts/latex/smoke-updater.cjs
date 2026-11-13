// Run with the pristine Electron binary on the Windows build runner. No installer
// is executed; the real updater checks metadata, downloads, and rejects corruption.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { createReadStream } = require("node:fs");
const { mkdtemp, mkdir, rm, stat, writeFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { Transform } = require("node:stream");
const { app } = require("electron");
const {
  createLatexAutoUpdater,
  latexUpdateVersion,
} = require("../../packages/desktop/dist/features/latex-auto-updater.js");

async function digest(file) {
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("base64");
}

async function main() {
  await app.whenReady();
  const installer = process.env.PASEO_LATEX_UPDATER_SMOKE_INSTALLER;
  const version = process.env.PASEO_LATEX_UPDATER_SMOKE_VERSION;
  const revision = Number(process.env.PASEO_LATEX_UPDATER_SMOKE_REVISION);
  const nextVersion = latexUpdateVersion(version, revision);
  const sha512 = await digest(installer);
  const size = (await stat(installer)).size;
  const directory = await mkdtemp(path.join(tmpdir(), "paseo-updater-smoke-"));
  let corrupt = false;
  let fileRequests = 0;
  const server = createServer((req, res) => {
    if (req.url.startsWith("/latest.yml")) {
      res.setHeader("Content-Type", "text/yaml");
      res.end(
        JSON.stringify({
          version: nextVersion,
          files: [{ url: "installer.exe", sha512, size }],
          releaseDate: new Date().toISOString(),
        }),
      );
      return;
    }
    if (req.url === "/installer.exe") {
      fileRequests++;
      res.setHeader("Content-Length", size);
      const input = createReadStream(installer);
      let changed = false;
      const transform = new Transform({
        transform(chunk, _encoding, done) {
          if (corrupt && !changed) {
            chunk[0] ^= 1;
            changed = true;
          }
          done(null, chunk);
        },
      });
      input.on("error", (error) => res.destroy(error));
      input.pipe(transform).pipe(res);
      return;
    }
    res.writeHead(404).end();
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    async function updaterFor(name) {
      const home = path.join(directory, name);
      await mkdir(home);
      const config = path.join(home, "app-update.yml");
      await writeFile(
        config,
        JSON.stringify({ provider: "generic", url, updaterCacheDirName: name }),
      );
      const updater = createLatexAutoUpdater(revision, {
        version: `${version}-latex.${revision - 1}`,
        name: "Paseo LaTeX",
        isPackaged: true,
        appUpdateConfigPath: config,
        userDataPath: home,
        baseCachePath: home,
        whenReady: async () => {},
        quit() {
          throw new Error("The smoke check must not install anything");
        },
        relaunch() {
          throw new Error("The smoke check must not relaunch anything");
        },
        onQuit() {},
      });
      updater.logger = null;
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;
      // Keep the NSIS feed filename when checking this harness on Linux as well.
      Object.assign(updater, { _testOnlyOptions: { platform: "win32" } });
      updater.setFeedURL({
        provider: "generic",
        url,
        channel: "latest",
        useMultipleRangeRequest: false,
      });
      return updater;
    }
    const valid = await updaterFor("valid");
    const result = await valid.checkForUpdates();
    assert.equal(result.isUpdateAvailable, true);
    assert.equal(result.updateInfo.version, nextVersion);
    const files = await valid.downloadUpdate();
    assert.equal(files.length, 1);
    assert.equal(await digest(files[0]), sha512);
    corrupt = true;
    const invalid = await updaterFor("corrupt");
    await invalid.checkForUpdates();
    await assert.rejects(() => invalid.downloadUpdate(), /checksum mismatch/i);
    assert.equal(fileRequests, 2);
    console.log(
      "Windows updater: newer revision detected, full installer verified, corrupted download rejected; no installation attempted.",
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

main().then(
  () => app.exit(0),
  (error) => {
    console.error(error);
    app.exit(1);
  },
);
