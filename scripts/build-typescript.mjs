import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Keep the default release compiler. Low-memory local builds use the same native
// compiler as repository typechecks, with bounded Go heap/CPU concurrency.
const lowMemory = process.env.PASEO_LOW_MEMORY_BUILD === "1";
const compiler = fileURLToPath(
  new URL(
    lowMemory
      ? "../node_modules/@typescript/native-preview/bin/tsgo.js"
      : "../node_modules/typescript/bin/tsc",
    import.meta.url,
  ),
);
const child = spawn(process.execPath, [compiler, ...process.argv.slice(2)], {
  stdio: "inherit",
  windowsHide: true,
  env: lowMemory ? { ...process.env, GOMEMLIMIT: "1024MiB", GOMAXPROCS: "2" } : process.env,
});
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
