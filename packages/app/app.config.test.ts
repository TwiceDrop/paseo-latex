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

async function resolveAndroidManifest() {
  const { exp } = await getPrebuildConfigAsync(__dirname, { platforms: ["android"] });
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
    const { exp } = await getPrebuildConfigAsync(__dirname, { platforms: ["android"] });
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
    const { exp } = await getPrebuildConfigAsync(__dirname, { platforms: ["android"] });
    expect(exp.extra.eas.projectId).toBe("11111111-2222-4333-8444-555555555555");
    expect(exp.owner).toBeUndefined();
  }, 30_000);

  it("allows increasing the revision without changing the upstream version", async () => {
    process.env.APP_VARIANT = "latex";
    process.env.PASEO_LATEX_REVISION = "1";
    const first = await getPrebuildConfigAsync(__dirname, { platforms: ["android"] });
    process.env.PASEO_LATEX_REVISION = "2";
    const second = await getPrebuildConfigAsync(__dirname, { platforms: ["android"] });
    expect(second.exp.android.versionCode).toBe(first.exp.android.versionCode + 1);
    expect(second.exp.version).toBe(first.exp.version);
  }, 30_000);

  it("rejects an invalid LaTeX build revision", async () => {
    process.env.APP_VARIANT = "latex";
    process.env.PASEO_LATEX_REVISION = "100";
    await expect(getPrebuildConfigAsync(__dirname, { platforms: ["android"] })).rejects.toThrow(
      "PASEO_LATEX_REVISION must be an integer from 1 through 99",
    );
  }, 30_000);

  it("preserves the official production app identity", async () => {
    process.env.APP_VARIANT = "production";
    const { exp } = await getPrebuildConfigAsync(__dirname, { platforms: ["android"] });
    expect(exp.name).toBe("Paseo");
    expect(exp.android.package).toBe("sh.paseo");
    expect(exp.owner).toBe("getpaseo");
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
