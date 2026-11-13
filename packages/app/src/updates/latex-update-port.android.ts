import * as Application from "expo-application";
import { requireNativeModule, type EventSubscription } from "expo-modules-core";
import { checkLatexRelease } from "./latex-release";
import type { LatexUpdatePort } from "./latex-updater";

interface UpdateModule {
  addListener(
    name: "downloadProgress",
    listener: (event: { received: number; total: number }) => void,
  ): EventSubscription;
  downloadAsync(
    url: string,
    sha256: string,
    size: number,
    code: number,
    version: string,
  ): Promise<void>;
  cancelDownload(): void;
  installAsync(code: number, sha256: string, version: string): Promise<"permission" | "installer">;
}

export function createNativeLatexUpdatePort(): LatexUpdatePort | null {
  if (Application.applicationId !== "sh.paseo.latex") return null;
  const installedVersionCode = Number(Application.nativeBuildVersion);
  if (!Number.isSafeInteger(installedVersionCode) || installedVersionCode <= 0) return null;
  const native = requireNativeModule<UpdateModule>("PaseoAppUpdate");
  return {
    installedVersionCode,
    check: checkLatexRelease,
    async download(release, progress) {
      const subscription = native.addListener("downloadProgress", (event) =>
        progress(event.received / event.total),
      );
      try {
        await native.downloadAsync(
          release.url,
          release.sha256,
          release.size,
          release.versionCode,
          release.version,
        );
      } finally {
        subscription.remove();
      }
    },
    cancelDownload: () => native.cancelDownload(),
    install: (release) => native.installAsync(release.versionCode, release.sha256, release.version),
  };
}
