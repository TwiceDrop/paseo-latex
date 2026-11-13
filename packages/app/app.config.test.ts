import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

// Load the copies the Expo CLI uses for prebuild, not older hoisted ones.
const requireFromExpo = createRequire(require.resolve("expo/package.json"));
const requireFromExpoCli = createRequire(requireFromExpo.resolve("@expo/cli/package.json"));
const { getPrebuildConfigAsync } = requireFromExpoCli("@expo/prebuild-config");
const { compileModsAsync } = requireFromExpoCli(
  "@expo/config-plugins/build/plugins/mod-compiler.js",
);

interface ManifestEntry {
  $: Record<string, string>;
}

const originalFdroidFlag = process.env.PASEO_FDROID_BUILD;
const originalAppVariant = process.env.APP_VARIANT;
const originalLatexRevision = process.env.PASEO_LATEX_REVISION;
const originalPersonalProjectId = process.env.PASEO_LATEX_EAS_PROJECT_ID;

function loadAndroidConfig() {
  // Expo 57 caches this module; each build variant must read the current environment.
  delete require.cache[require.resolve("./app.config.js")];
  return getPrebuildConfigAsync(__dirname, { platforms: ["android"] });
}

async function resolveAndroidManifest() {
  const { exp } = await loadAndroidConfig();
  await compileModsAsync(exp, {
    projectRoot: __dirname,
    introspect: true,
    platforms: ["android"],
    assertMissingModProviders: false,
  });
  return exp._internal.modResults.android.manifest.manifest;
}

describe("Android app config", () => {
  afterEach(() => {
    if (originalFdroidFlag === undefined) {
      delete process.env.PASEO_FDROID_BUILD;
    } else {
      process.env.PASEO_FDROID_BUILD = originalFdroidFlag;
    }
    if (originalAppVariant === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = originalAppVariant;
    if (originalLatexRevision === undefined) delete process.env.PASEO_LATEX_REVISION;
    else process.env.PASEO_LATEX_REVISION = originalLatexRevision;
    if (originalPersonalProjectId === undefined) delete process.env.PASEO_LATEX_EAS_PROJECT_ID;
    else process.env.PASEO_LATEX_EAS_PROJECT_ID = originalPersonalProjectId;
  });

  it("builds LaTeX as a separate app without the official Expo account", async () => {
    process.env.APP_VARIANT = "latex";
    delete process.env.PASEO_LATEX_EAS_PROJECT_ID;
    const { exp } = await loadAndroidConfig();
    expect(exp.name).toBe("Paseo LaTeX");
    expect(exp.android.package).toBe("sh.paseo.latex");
    expect(exp.slug).toBe("paseo-latex");
    expect(exp.scheme).toBe("paseo");
    expect(exp.owner).toBeUndefined();
    expect(exp.extra.eas).toBeUndefined();
  }, 30_000);

  it("can use a personal Expo project for push notifications", async () => {
    process.env.APP_VARIANT = "latex";
    process.env.PASEO_LATEX_EAS_PROJECT_ID = "11111111-2222-4333-8444-555555555555";
    const { exp } = await loadAndroidConfig();
    expect(exp.extra.eas.projectId).toBe("11111111-2222-4333-8444-555555555555");
    expect(exp.owner).toBeUndefined();
  }, 30_000);

  it("allows increasing the revision without changing the upstream version", async () => {
    process.env.APP_VARIANT = "latex";
    process.env.PASEO_LATEX_REVISION = "1";
    const first = await loadAndroidConfig();
    process.env.PASEO_LATEX_REVISION = "2";
    const second = await loadAndroidConfig();
    expect(second.exp.android.versionCode).toBe(first.exp.android.versionCode + 1);
    expect(second.exp.version).toBe(first.exp.version);
  }, 30_000);

  it("rejects an invalid LaTeX build revision", async () => {
    process.env.APP_VARIANT = "latex";
    process.env.PASEO_LATEX_REVISION = "100";
    await expect(loadAndroidConfig()).rejects.toThrow(
      "PASEO_LATEX_REVISION must be an integer from 1 through 99",
    );
  }, 30_000);

  it("preserves the official production app identity", async () => {
    process.env.APP_VARIANT = "production";
    const { exp } = await loadAndroidConfig();
    expect(exp.name).toBe("Paseo");
    expect(exp.android.package).toBe("sh.paseo");
    expect(exp.owner).toBe("getpaseo");
  }, 30_000);

  it("limits the APK installation permission and update provider to the personal build", async () => {
    process.env.APP_VARIANT = "latex";
    const personal = await resolveAndroidManifest();
    expect(
      personal["uses-permission"].map((entry: ManifestEntry) => entry.$["android:name"]),
    ).toContain("android.permission.REQUEST_INSTALL_PACKAGES");
    const provider = personal.application[0].provider.find(
      (entry: ManifestEntry) => entry.$["android:authorities"] === "${applicationId}.updates",
    );
    expect(provider.$["android:exported"]).toBe("false");
    expect(provider["meta-data"][0].$["android:resource"]).toBe("@xml/paseo_update_paths");
    process.env.APP_VARIANT = "production";
    const official = await resolveAndroidManifest();
    expect(
      official["uses-permission"].map((entry: ManifestEntry) => entry.$["android:name"]),
    ).not.toContain("android.permission.REQUEST_INSTALL_PACKAGES");
    expect(
      (official.application[0].provider ?? []).some(
        (entry: ManifestEntry) => entry.$["android:authorities"] === "${applicationId}.updates",
      ),
    ).toBe(false);
  }, 30_000);

  it.each([
    ["Google Play", "0"],
    ["F-Droid", "1"],
  ])(
    "%s build installs on devices without a camera",
    async (_build, fdroidFlag) => {
      process.env.PASEO_FDROID_BUILD = fdroidFlag;
      const manifest = await resolveAndroidManifest();
      const permissions = (manifest["uses-permission"] ?? []).map(
        (entry: ManifestEntry) => entry.$["android:name"],
      );
      const features = (manifest["uses-feature"] ?? []).map((entry: ManifestEntry) => entry.$);

      expect(permissions).toContain("android.permission.CAMERA");
      expect(features).toEqual(
        expect.arrayContaining([
          { "android:name": "android.hardware.camera", "android:required": "false" },
          { "android:name": "android.hardware.camera.autofocus", "android:required": "false" },
        ]),
      );
    },
    30_000,
  );
});

it("follows system rotation on Android", async () => {
  const manifest = await resolveAndroidManifest();
  const activity = manifest.application[0].activity.find(
    (entry: ManifestEntry) => entry.$["android:name"] === ".MainActivity",
  );
  expect(activity.$["android:screenOrientation"]).toBe("unspecified");
}, 30_000);

it("allows all orientations on iPhone and iPad", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "paseo-ios-config-"));
  try {
    const { exp } = await getPrebuildConfigAsync(__dirname, { platforms: ["ios"] });
    await compileModsAsync(exp, {
      projectRoot: root,
      introspect: true,
      platforms: ["ios"],
      assertMissingModProviders: false,
    });
    const plist = exp._internal.modResults.ios.infoPlist;
    const orientations = [
      "UIInterfaceOrientationPortrait",
      "UIInterfaceOrientationPortraitUpsideDown",
      "UIInterfaceOrientationLandscapeLeft",
      "UIInterfaceOrientationLandscapeRight",
    ];
    expect(plist.UISupportedInterfaceOrientations).toEqual(orientations);
    expect(plist["UISupportedInterfaceOrientations~ipad"]).toEqual(orientations);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
