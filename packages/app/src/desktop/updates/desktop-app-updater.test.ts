import { describe, expect, it } from "vitest";
import { parseLatexRelease } from "@/updates/latex-release";
import { createLatexUpdater, type LatexUpdatePort } from "@/updates/latex-updater";
import { i18n } from "@/i18n/i18next";
import {
  createDesktopAppUpdater,
  formatStatusText,
  type DesktopAppUpdater,
  type DesktopAppUpdaterErrorReport,
} from "./desktop-app-updater";
import {
  buildFakeCheckResult,
  buildFakeInstallResult,
  createFakeDesktopAppUpdaterPort,
  type FakeDesktopAppUpdaterPort,
} from "./test-utils/fake-desktop-app-updater-port";

const personalRelease = {
  tag_name: "latex-v0.15.3-r2",
  draft: false,
  prerelease: false,
  assets: [
    {
      name: "paseo-latex-0.15.3-r2.apk",
      size: 100,
      hash_algo: "sha256",
      hash_value: "a".repeat(64),
    },
  ],
};

describe("personal Android updater", () => {
  it("uses only a complete stable personal APK and its versioned CNB URL", () => {
    const release = parseLatexRelease(personalRelease);
    expect(release.versionCode).toBe(1500302);
    expect(release.url).toBe(
      "https://cnb.cool/twicedrop/paseo-latex/-/releases/download/latex-v0.15.3-r2/paseo-latex-0.15.3-r2.apk",
    );
    for (const invalid of [
      { ...personalRelease, draft: true },
      { ...personalRelease, prerelease: true },
      { ...personalRelease, tag_name: "v0.15.3" },
      { ...personalRelease, assets: [] },
      { ...personalRelease, assets: [...personalRelease.assets, ...personalRelease.assets] },
      { ...personalRelease, assets: [{ ...personalRelease.assets[0], hash_algo: "md5" }] },
      { ...personalRelease, assets: [{ ...personalRelease.assets[0], hash_value: "bad" }] },
    ])
      expect(() => parseLatexRelease(invalid)).toThrow();
  });

  function createPort(overrides: Partial<LatexUpdatePort> = {}): LatexUpdatePort {
    return {
      installedVersionCode: 1500301,
      check: async () => parseLatexRelease(personalRelease),
      download: async (_release, progress) => {
        progress(1);
      },
      cancelDownload() {},
      install: async () => "installer",
      ...overrides,
    };
  }

  it("detects a new revision and keeps permission denial/cancelled installation retryable", async () => {
    let downloads = 0;
    let installs = 0;
    const updater = createLatexUpdater(
      createPort({
        download: async () => {
          downloads++;
        },
        install: async () => (++installs === 1 ? "permission" : "installer"),
      }),
    );
    await updater.check();
    expect(updater.getState().status).toBe("available");
    await updater.install();
    expect(installs).toBe(0);
    await updater.download();
    expect(updater.getState().status).toBe("ready");
    await updater.install();
    expect(updater.getState().status).toBe("permission");
    await updater.install();
    expect(updater.getState().status).toBe("installer");
    await updater.install();
    expect(installs).toBe(3);
    expect(downloads).toBe(1);
  });

  it("does not offer equal or older APKs", async () => {
    for (const installedVersionCode of [1500302, 1500303, 1500401]) {
      const updater = createLatexUpdater(createPort({ installedVersionCode }));
      await updater.check();
      expect(updater.getState().status).toBe("current");
    }
  });

  it("exposes a failed check and checksum failure and permits a clean retry", async () => {
    let checks = 0;
    let downloads = 0;
    const updater = createLatexUpdater(
      createPort({
        check: async () => {
          if (++checks === 1) throw new Error("CNB unavailable");
          return parseLatexRelease(personalRelease);
        },
        download: async () => {
          if (++downloads === 1) throw new Error("Checksum mismatch");
        },
      }),
    );
    await updater.check();
    expect(updater.getState().error).toBe("CNB unavailable");
    await updater.check();
    await updater.download();
    expect(updater.getState()).toMatchObject({
      status: "error",
      error: "Checksum mismatch",
      downloaded: false,
    });
    await updater.download();
    expect(updater.getState()).toMatchObject({ status: "ready", error: null, downloaded: true });
  });

  it("ignores late completion and progress after cancellation", async () => {
    let finish!: () => void;
    let progress!: (value: number) => void;
    let cancellations = 0;
    const updater = createLatexUpdater(
      createPort({
        download: async (_release, listener) => {
          progress = listener;
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
        },
        cancelDownload: () => {
          cancellations++;
        },
      }),
    );
    await updater.check();
    const pending = updater.download();
    progress(0.5);
    expect(updater.getState().progress).toBe(0.5);
    updater.cancel();
    progress(1);
    finish();
    await pending;
    expect(updater.getState()).toMatchObject({
      status: "available",
      progress: 0,
      downloaded: false,
    });
    expect(cancellations).toBe(1);
    updater.dispose();
  });
});

function createUpdater(
  overrides: {
    port?: FakeDesktopAppUpdaterPort;
    now?: () => number;
    reportInstallError?: (report: DesktopAppUpdaterErrorReport) => void;
  } = {},
): {
  updater: DesktopAppUpdater;
  port: FakeDesktopAppUpdaterPort;
  reportedInstallErrors: DesktopAppUpdaterErrorReport[];
} {
  const port = overrides.port ?? createFakeDesktopAppUpdaterPort();
  const reportedInstallErrors: DesktopAppUpdaterErrorReport[] = [];
  const updater = createDesktopAppUpdater({
    port,
    now: overrides.now ?? (() => 1_700_000_000_000),
    reportInstallError:
      overrides.reportInstallError ??
      ((report) => {
        reportedInstallErrors.push(report);
      }),
  });
  return { updater, port, reportedInstallErrors };
}

describe("desktop app updater — check", () => {
  it("forwards manual check intent and the requested release channel to the port", async () => {
    const { updater, port } = createUpdater();
    port.nextCheckResult(buildFakeCheckResult());

    await updater.checkForUpdates({ releaseChannel: "beta" });

    expect(port.recordedChecks).toEqual([{ releaseChannel: "beta", intent: "manual" }]);
  });

  it("forwards automatic check intent independently from silent UI state", async () => {
    const { updater, port } = createUpdater();
    port.nextCheckResult(buildFakeCheckResult());

    await updater.checkForUpdates({ releaseChannel: "stable", intent: "automatic", silent: true });

    expect(port.recordedChecks).toEqual([{ releaseChannel: "stable", intent: "automatic" }]);
  });

  it("does not add manual last-checked feedback for automatic checks", async () => {
    const { updater, port } = createUpdater({ now: () => 42 });
    port.nextCheckResult(buildFakeCheckResult({ hasUpdate: true, readyToInstall: false }));

    await updater.checkForUpdates({ releaseChannel: "stable", intent: "automatic", silent: true });

    expect(updater.getSnapshot()).toMatchObject({
      status: "pending",
      lastCheckedAt: null,
    });
  });

  it("moves to 'checking' during a non-silent check", async () => {
    const { updater, port } = createUpdater();
    const deferred = port.deferNextCheck();

    const pending = updater.checkForUpdates({ releaseChannel: "stable" });
    expect(updater.getSnapshot().status).toBe("checking");
    expect(updater.getSnapshot().isChecking).toBe(true);

    deferred.resolve(buildFakeCheckResult());
    await pending;
  });

  it("stays on the current status during a silent check", async () => {
    const { updater, port } = createUpdater();
    port.nextCheckResult(buildFakeCheckResult({ hasUpdate: true, readyToInstall: true }));
    await updater.checkForUpdates({ releaseChannel: "stable" });
    expect(updater.getSnapshot().status).toBe("available");

    const deferred = port.deferNextCheck();
    const pending = updater.checkForUpdates({
      releaseChannel: "stable",
      intent: "automatic",
      silent: true,
    });
    expect(updater.getSnapshot().status).toBe("available");

    deferred.resolve(buildFakeCheckResult({ hasUpdate: true, readyToInstall: true }));
    await pending;
  });

  it("reports 'available' when the check resolves with a downloaded update", async () => {
    const { updater, port } = createUpdater({ now: () => 42 });
    port.nextCheckResult(
      buildFakeCheckResult({ hasUpdate: true, readyToInstall: true, latestVersion: "1.2.3" }),
    );

    await updater.checkForUpdates({ releaseChannel: "stable" });

    expect(updater.getSnapshot()).toMatchObject({
      status: "available",
      availableUpdate: { latestVersion: "1.2.3" },
      lastCheckedAt: 42,
    });
  });

  it("reports the found update while it is still preparing", async () => {
    const { updater, port } = createUpdater();
    port.nextCheckResult(
      buildFakeCheckResult({ hasUpdate: true, readyToInstall: false, latestVersion: "1.2.3" }),
    );

    await updater.checkForUpdates({ releaseChannel: "stable" });

    expect(updater.getSnapshot()).toMatchObject({
      status: "pending",
      availableUpdate: { latestVersion: "1.2.3", readyToInstall: false },
    });
  });

  it("reports 'up-to-date' when the check resolves with no update", async () => {
    const { updater, port } = createUpdater();
    port.nextCheckResult(buildFakeCheckResult({ hasUpdate: false, readyToInstall: false }));

    await updater.checkForUpdates({ releaseChannel: "stable" });

    expect(updater.getSnapshot().status).toBe("up-to-date");
  });

  it("reports 'error' when a non-silent check throws", async () => {
    const { updater, port } = createUpdater();
    port.failNextCheck(new Error("network down"));

    await updater.checkForUpdates({ releaseChannel: "stable" });

    expect(updater.getSnapshot()).toMatchObject({
      status: "error",
      errorMessage: "network down",
    });
  });

  it("reports service-returned check errors", async () => {
    const { updater, port } = createUpdater({ now: () => 42 });
    port.nextCheckResult(buildFakeCheckResult({ errorMessage: "sha512 checksum mismatch" }));

    await updater.checkForUpdates({ releaseChannel: "stable" });

    expect(updater.getSnapshot()).toMatchObject({
      status: "error",
      errorMessage: "sha512 checksum mismatch",
      lastCheckedAt: 42,
    });
  });

  it("keeps no-update silent check errors quiet", async () => {
    const { updater, port } = createUpdater({ now: () => 42 });
    port.nextCheckResult(
      buildFakeCheckResult({ hasUpdate: true, readyToInstall: true, latestVersion: "1.2.3" }),
    );
    await updater.checkForUpdates({ releaseChannel: "stable" });

    port.nextCheckResult(buildFakeCheckResult({ errorMessage: "network down" }));
    await updater.checkForUpdates({ releaseChannel: "stable", intent: "automatic", silent: true });

    expect(updater.getSnapshot()).toMatchObject({
      status: "available",
      errorMessage: null,
      lastCheckedAt: 42,
    });
  });

  it("shows silent update preparation errors when an update is involved", async () => {
    const { updater, port } = createUpdater();
    port.nextCheckResult(
      buildFakeCheckResult({
        hasUpdate: true,
        readyToInstall: false,
        latestVersion: "1.2.3",
        errorMessage: "sha512 checksum mismatch",
      }),
    );

    await updater.checkForUpdates({ releaseChannel: "stable", intent: "automatic", silent: true });

    expect(updater.getSnapshot()).toMatchObject({
      status: "error",
      errorMessage: "sha512 checksum mismatch",
      lastCheckedAt: null,
    });
  });

  it("does not let a silent check supersede an in-flight manual check", async () => {
    const { updater, port } = createUpdater();
    const deferred = port.deferNextCheck();

    const manualCheck = updater.checkForUpdates({ releaseChannel: "stable" });
    port.nextCheckResult(buildFakeCheckResult({ errorMessage: "network down" }));
    await updater.checkForUpdates({ releaseChannel: "stable", intent: "automatic", silent: true });

    deferred.resolve(buildFakeCheckResult({ hasUpdate: false, readyToInstall: false }));
    await manualCheck;

    expect(port.recordedChecks).toEqual([{ releaseChannel: "stable", intent: "manual" }]);
    expect(updater.getSnapshot().status).toBe("up-to-date");
  });

  it("does not let an older silent check supersede a newer silent check", async () => {
    const { updater, port } = createUpdater();
    const olderCheck = port.deferNextCheck();
    const olderPending = updater.checkForUpdates({
      releaseChannel: "stable",
      intent: "automatic",
      silent: true,
    });
    const newerCheck = port.deferNextCheck();
    const newerPending = updater.checkForUpdates({
      releaseChannel: "stable",
      intent: "automatic",
      silent: true,
    });

    newerCheck.resolve(
      buildFakeCheckResult({ hasUpdate: true, readyToInstall: true, latestVersion: "2.0.0" }),
    );
    await newerPending;
    expect(updater.getSnapshot()).toMatchObject({
      status: "available",
      availableUpdate: { latestVersion: "2.0.0" },
    });

    olderCheck.resolve(buildFakeCheckResult({ hasUpdate: false, readyToInstall: false }));
    await olderPending;

    expect(updater.getSnapshot()).toMatchObject({
      status: "available",
      availableUpdate: { latestVersion: "2.0.0" },
    });
  });

  it("lets a newer silent check win after an older silent check resolves first", async () => {
    const { updater, port } = createUpdater();
    const olderCheck = port.deferNextCheck();
    const olderPending = updater.checkForUpdates({
      releaseChannel: "stable",
      intent: "automatic",
      silent: true,
    });
    const newerCheck = port.deferNextCheck();
    const newerPending = updater.checkForUpdates({
      releaseChannel: "stable",
      intent: "automatic",
      silent: true,
    });

    olderCheck.resolve(buildFakeCheckResult({ hasUpdate: false, readyToInstall: false }));
    await olderPending;
    expect(updater.getSnapshot().status).toBe("idle");

    newerCheck.resolve(
      buildFakeCheckResult({ hasUpdate: true, readyToInstall: true, latestVersion: "2.0.0" }),
    );
    await newerPending;

    expect(updater.getSnapshot()).toMatchObject({
      status: "available",
      availableUpdate: { latestVersion: "2.0.0" },
    });
  });

  it("does not move to 'error' when a silent check throws", async () => {
    const { updater, port } = createUpdater();
    port.nextCheckResult(buildFakeCheckResult({ hasUpdate: true, readyToInstall: true }));
    await updater.checkForUpdates({ releaseChannel: "stable" });
    const statusBeforeSilent = updater.getSnapshot().status;

    port.failNextCheck(new Error("boom"));
    await updater.checkForUpdates({ releaseChannel: "stable", intent: "automatic", silent: true });

    expect(updater.getSnapshot().status).toBe(statusBeforeSilent);
  });

  it("ignores the older result when a newer check supersedes it mid-flight", async () => {
    const { updater, port } = createUpdater();
    const firstDeferred = port.deferNextCheck();
    port.nextCheckResult(buildFakeCheckResult({ hasUpdate: true, readyToInstall: true }));

    const firstPending = updater.checkForUpdates({ releaseChannel: "stable" });
    const secondPending = updater.checkForUpdates({ releaseChannel: "stable" });
    await secondPending;
    expect(updater.getSnapshot().status).toBe("available");

    firstDeferred.resolve(buildFakeCheckResult({ hasUpdate: false, readyToInstall: false }));
    await firstPending;

    expect(updater.getSnapshot().status).toBe("available");
  });
});

describe("desktop app updater — install", () => {
  it("forwards the requested release channel to the port", async () => {
    const { updater, port } = createUpdater();
    port.nextInstallResult(buildFakeInstallResult({ installed: true }));

    await updater.installUpdate({ releaseChannel: "beta" });

    expect(port.recordedInstalls).toEqual([{ releaseChannel: "beta" }]);
  });

  it("moves to 'installed' when the install reports installation succeeded", async () => {
    const { updater, port } = createUpdater();
    port.nextInstallResult(
      buildFakeInstallResult({ installed: true, message: "Restart to finish" }),
    );

    await updater.installUpdate({ releaseChannel: "stable" });

    expect(updater.getSnapshot()).toMatchObject({
      status: "installed",
      installMessage: "Restart to finish",
      isInstalling: false,
    });
  });

  it("moves to 'up-to-date' when the install reports nothing to install", async () => {
    const { updater, port } = createUpdater();
    port.nextInstallResult(buildFakeInstallResult({ installed: false }));

    await updater.installUpdate({ releaseChannel: "stable" });

    expect(updater.getSnapshot().status).toBe("up-to-date");
  });

  it("reports the install error and moves to 'error' when the install throws", async () => {
    const { updater, port, reportedInstallErrors } = createUpdater();
    const error = new Error("install failed");
    port.failNextInstall(error);

    await updater.installUpdate({ releaseChannel: "stable" });

    expect(updater.getSnapshot()).toMatchObject({
      status: "error",
      errorMessage: "install failed",
      isInstalling: false,
    });
    expect(reportedInstallErrors).toEqual([
      {
        error,
        message: "Unable to install the desktop app update.",
        logLabel: "[DesktopUpdater] Failed to install app update",
      },
    ]);
  });
});

describe("desktop app updater — subscribe", () => {
  it("notifies subscribers when the status changes", async () => {
    const { updater, port } = createUpdater();
    port.nextCheckResult(buildFakeCheckResult({ hasUpdate: true, readyToInstall: true }));

    const notifications: string[] = [];
    const unsubscribe = updater.subscribe(() => {
      notifications.push(updater.getSnapshot().status);
    });

    await updater.checkForUpdates({ releaseChannel: "stable" });
    unsubscribe();

    expect(notifications).toEqual(["checking", "available"]);
  });
});

describe("formatStatusText", () => {
  const formatVersion = (version: string | null | undefined) =>
    version ? `v${version.replace(/^v/i, "")}` : "\u2014";
  const formatLastCheckedAt = (timestamp: number) => `time-${timestamp}`;

  it("shows when an up-to-date check completed", () => {
    expect(
      formatStatusText({
        status: "up-to-date",
        availableUpdate: null,
        installMessage: null,
        lastCheckedAt: 42,
        formatVersion,
        formatLastCheckedAt,
      }),
    ).toBe("Up to date. Last checked at time-42.");
  });

  it("uses the latest version in the 'available' message when present", () => {
    expect(
      formatStatusText({
        status: "available",
        availableUpdate: buildFakeCheckResult({ latestVersion: "1.2.3" }),
        installMessage: null,
        lastCheckedAt: null,
        formatVersion,
        formatLastCheckedAt,
      }),
    ).toBe("Update ready: v1.2.3");
  });

  it("shows the found version while an update is pending", () => {
    expect(
      formatStatusText({
        status: "pending",
        availableUpdate: buildFakeCheckResult({ latestVersion: "1.2.3" }),
        installMessage: null,
        lastCheckedAt: 42,
        formatVersion,
        formatLastCheckedAt,
      }),
    ).toBe("Update found: v1.2.3. Downloading... Last checked at time-42.");
  });

  it("keeps manual check feedback visible when an update is available", () => {
    expect(
      formatStatusText({
        status: "available",
        availableUpdate: buildFakeCheckResult({ latestVersion: "1.2.3" }),
        installMessage: null,
        lastCheckedAt: 42,
        formatVersion,
        formatLastCheckedAt,
      }),
    ).toBe("Update ready: v1.2.3. Last checked at time-42.");
  });

  it("falls back to a generic 'available' message when no version is reported", () => {
    expect(
      formatStatusText({
        status: "available",
        availableUpdate: null,
        installMessage: null,
        lastCheckedAt: null,
        formatVersion,
        formatLastCheckedAt,
      }),
    ).toBe("An app update is ready to install.");
  });

  it("uses the install message in the 'installed' state when present", () => {
    expect(
      formatStatusText({
        status: "installed",
        availableUpdate: null,
        installMessage: "Restart now",
        lastCheckedAt: null,
        formatVersion,
        formatLastCheckedAt,
      }),
    ).toBe("Restart now");
  });

  it("uses the active app language for local status wrappers", async () => {
    await i18n.changeLanguage("zh-CN");
    try {
      expect(
        formatStatusText({
          status: "checking",
          availableUpdate: null,
          installMessage: null,
          lastCheckedAt: null,
          formatVersion,
          formatLastCheckedAt,
        }),
      ).toBe("正在检查 app 更新...");
      expect(
        formatStatusText({
          status: "available",
          availableUpdate: buildFakeCheckResult({ latestVersion: "1.2.3" }),
          installMessage: null,
          lastCheckedAt: null,
          formatVersion,
          formatLastCheckedAt,
        }),
      ).toBe("更新已就绪：v1.2.3");
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});
