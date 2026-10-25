import path from "node:path";
import { createRequire } from "node:module";
import { resolveCliShimPath } from "./path.js";
import os from "node:os";
import { app } from "electron";
import { isLatexDesktop } from "../../distribution.js";

export function getLocalBinDir(): string {
  return path.join(os.homedir(), ".local", "bin");
}

export function getCliTargetPath(): string {
  const command = isLatexDesktop ? "paseo-latex" : "paseo";
  const filename = process.platform === "win32" ? `${command}.cmd` : command;
  return path.join(getLocalBinDir(), filename);
}

export function getBundledCliShimPath(): string {
  return resolveCliShimPath({
    platform: process.platform,
    isPackaged: app.isPackaged,
    executablePath: app.getPath("exe"),
    resolveWorkspaceCli: () => createRequire(__filename).resolve("@getpaseo/cli/bin/paseo"),
  });
}
