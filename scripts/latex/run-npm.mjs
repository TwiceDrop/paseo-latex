import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export function runNpm(args, { cwd = repoRoot, env = process.env } = {}) {
  if (!process.env.npm_execpath) throw new Error("Run this command through npm run.");
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${args.join(" ")} exited ${result.status}`);
}
