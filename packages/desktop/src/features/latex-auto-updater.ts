import path from "node:path";
import { NsisUpdater } from "electron-updater";
import type { AppAdapter } from "electron-updater/out/AppAdapter.js";
import { ElectronAppAdapter } from "electron-updater/out/ElectronAppAdapter.js";
import { ElectronHttpExecutor } from "electron-updater/out/electronHttpExecutor.js";

export const LATEX_UPDATE_FEED =
  "https://cnb.cool/twicedrop/paseo-latex/-/releases/latest/download";

export function latexUpdateVersion(baseVersion: string, revision: number): string {
  if (
    !/^\d+\.\d+\.\d+$/.test(baseVersion) ||
    !Number.isInteger(revision) ||
    revision < 1 ||
    revision > 99
  ) {
    throw new Error("Invalid personal update version");
  }
  // App/daemon protocol versions stay upstream-compatible. Only the updater
  // compares personal revisions; SemVer build metadata would ignore r1 -> r2.
  return `${baseVersion}-latex.${revision}`;
}

class LatexAppAdapter extends ElectronAppAdapter {
  constructor(private readonly revision: number) {
    super();
  }

  override get version(): string {
    return latexUpdateVersion(super.version, this.revision);
  }

  override get baseCachePath(): string {
    return path.join(super.baseCachePath, "paseo-latex");
  }
}

export function createLatexAutoUpdater(revision: number, adapter?: AppAdapter): NsisUpdater {
  const updater = new NsisUpdater(null, adapter ?? new LatexAppAdapter(revision));
  // A supplied AppAdapter opts electron-updater out of creating its HTTP executor.
  // Create it before setFeedURL: the provider captures this object at construction.
  Object.assign(updater, {
    httpExecutor: new ElectronHttpExecutor((authInfo, callback) =>
      updater.emit("login", authInfo, callback),
    ),
  });
  updater.setFeedURL({
    provider: "generic",
    url: LATEX_UPDATE_FEED,
    channel: "latest",
    useMultipleRangeRequest: false,
  });
  updater.disableDifferentialDownload = true;
  updater.allowDowngrade = false;
  updater.allowPrerelease = true;
  return updater;
}
