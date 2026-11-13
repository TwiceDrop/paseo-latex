import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runWithRetry } from "../npm-retry.mjs";
import { prepareWindowsTools } from "./windows-tools.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (process.platform !== "win32") throw new Error("Run this installer build on Windows.");
const { version } = JSON.parse(
  fs.readFileSync(path.join(root, "packages/desktop/package.json"), "utf8"),
);
const packageOnly = process.argv.includes("--package-only");
const resume = process.argv.includes("--resume") || packageOnly;
const cliArgs = process.argv
  .slice(2)
  .filter((arg) => arg !== "--resume" && arg !== "--package-only");
if (cliArgs.length && (cliArgs.length !== 2 || cliArgs[0] !== "--revision"))
  throw new Error("Use --revision <1..99>");
const revision = Number(cliArgs[1] || "1");
if (!Number.isInteger(revision) || revision < 1 || revision > 99)
  throw new Error("Invalid Windows revision");
const output = path.join(root, `artifacts/windows-latex-${version}-r${revision}`);
const installer = path.join(output, `Paseo-LaTeX-Setup-${version}-r${revision}-x64.exe`);
const toolsDirectory = path.join(root, ".dev/windows-latex-tools");
if (fs.existsSync(installer))
  throw new Error(`Keep the delivered installer; use a new revision: ${installer}`);
const env = {
  ...process.env,
  NODE_OPTIONS: "--max-old-space-size=1536",
  PASEO_LOW_MEMORY_BUILD: "1",
  PASEO_WEB_PLATFORM: "electron",
  CI: "1",
  EXPO_NO_TELEMETRY: "1",
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
  PASEO_LATEX_WINDOWS_REVISION: String(revision),
  PASEO_LATEX_REVISION: String(revision),
  APP_VARIANT: "latex",
  ...(process.env.GH_TOKEN ? { ELECTRON_BUILDER_CACHE: path.join(toolsDirectory, "cache") } : {}),
};
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run with npm run windows:latex.");
async function run(args, cwd = root) {
  const freeGB = os.freemem() / 1024 ** 3;
  const renderer = args.includes("expo");
  if (freeGB < (renderer ? 3 : 2))
    throw new Error(`Only ${freeGB.toFixed(2)} GB available; build stopped before next step.`);
  console.log(`\n[windows-latex] ${args.join(" ")} (${freeGB.toFixed(2)} GB free)`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npm, ...args], {
      cwd,
      env: renderer ? { ...env, NODE_OPTIONS: "--max-old-space-size=2048" } : env,
      stdio: "inherit",
      windowsHide: true,
    });
    const memoryGuard = setInterval(() => {
      if (os.freemem() >= 1024 ** 3 || !child.pid) return;
      console.error("[windows-latex] Less than 1 GB free; stopping own build process tree.");
      spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      clearInterval(memoryGuard);
    }, 1000);
    child.on("error", (error) => {
      clearInterval(memoryGuard);
      reject(error);
    });
    child.on("exit", (code) => {
      clearInterval(memoryGuard);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Build step exited ${code}`));
    });
  });
}
// Each compiler has its own bounded process, and only one runs at a time.
const electronDist = process.env.GH_TOKEN
  ? await prepareWindowsTools({ directory: toolsDirectory, cache: env.ELECTRON_BUILDER_CACHE })
  : undefined;
if (!resume) {
  for (const workspace of ["highlight", "client", "plugin", "expo-two-way-audio", "server", "cli"])
    await run(["run", "build", `--workspace=@getpaseo/${workspace}`]);
  await run(["run", "build:document-preview", "--workspace=@getpaseo/app"]);
}
if (!packageOnly)
  await run(["exec", "--", "expo", "export", "--platform", "web"], path.join(root, "packages/app"));
await run(["run", "build:main", "--workspace=@getpaseo/desktop"]);
const packagingExitCode = await runWithRetry(
  [
    "exec",
    "--",
    "electron-builder",
    "--config",
    "electron-builder.latex.cjs",
    ...(electronDist ? [`--config.electronDist=${electronDist}`] : []),
    "--win",
    "--x64",
    "--publish",
    "never",
  ],
  {
    // Electron and NSIS tools are downloaded during packaging. Keep successful
    // downloads in this runner's cache and retry without recompiling the app.
    attempts: 5,
    backoffMs: 10_000,
    run: async (args) => {
      try {
        await run(args, path.join(root, "packages/desktop"));
        return 0;
      } catch (error) {
        console.error(error);
        return 1;
      }
    },
  },
);
if (packagingExitCode !== 0) process.exit(packagingExitCode);
if (electronDist) {
  // The packaging distribution has no default_app.asar. Install a smoke-only
  // entry point after packaging, so the delivered app never includes this harness.
  const smokeApp = path.join(electronDist, "resources/app");
  fs.mkdirSync(smokeApp, { recursive: true });
  fs.writeFileSync(
    path.join(smokeApp, "package.json"),
    JSON.stringify({
      name: "paseo-latex-updater-smoke",
      version,
      main: "index.cjs",
    }),
  );
  fs.writeFileSync(
    path.join(smokeApp, "index.cjs"),
    `process.on("uncaughtException", error => { console.error(error); require("electron").app.exit(1); });\nrequire(${JSON.stringify(path.join(root, "scripts/latex/smoke-updater.cjs"))});\n`,
  );
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(path.join(electronDist, "electron.exe"), [], {
        cwd: root,
        env: {
          ...env,
          PASEO_LATEX_UPDATER_SMOKE_INSTALLER: installer,
          PASEO_LATEX_UPDATER_SMOKE_VERSION: version,
          PASEO_LATEX_UPDATER_SMOKE_REVISION: String(revision),
        },
        stdio: "inherit",
        windowsHide: true,
      });
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("Windows updater smoke check timed out"));
      }, 5 * 60_000);
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("exit", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Windows updater smoke check failed (${code})`));
      });
    });
  } finally {
    fs.rmSync(smokeApp, { recursive: true, force: true });
  }
}
console.log(`\nInstaller: ${installer}`);
