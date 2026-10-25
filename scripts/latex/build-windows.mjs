import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

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
if (!resume) {
  for (const workspace of ["highlight", "client", "plugin", "expo-two-way-audio", "server", "cli"])
    await run(["run", "build", `--workspace=@getpaseo/${workspace}`]);
  await run(["run", "build:document-preview", "--workspace=@getpaseo/app"]);
}
if (!packageOnly)
  await run(["exec", "--", "expo", "export", "--platform", "web"], path.join(root, "packages/app"));
await run(["run", "build:main", "--workspace=@getpaseo/desktop"]);
await run(
  [
    "exec",
    "--",
    "electron-builder",
    "--config",
    "electron-builder.latex.cjs",
    "--win",
    "--x64",
    "--publish",
    "never",
  ],
  path.join(root, "packages/desktop"),
);
console.log(`\nInstaller: ${installer}`);
