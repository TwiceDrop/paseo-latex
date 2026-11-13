const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

module.exports = function withAndroidLatexUpdates(config) {
  return withAndroidManifest(config, (result) => {
    const manifest = result.modResults.manifest;
    manifest["uses-permission"] ??= [];
    if (
      !manifest["uses-permission"].some(
        (entry) => entry.$["android:name"] === "android.permission.REQUEST_INSTALL_PACKAGES",
      )
    ) {
      manifest["uses-permission"].push({
        $: { "android:name": "android.permission.REQUEST_INSTALL_PACKAGES" },
      });
    }
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(result.modResults);
    application.provider ??= [];
    const authority = "${applicationId}.updates";
    if (!application.provider.some((entry) => entry.$["android:authorities"] === authority)) {
      application.provider.push({
        $: {
          "android:name": "sh.paseo.download.PaseoUpdateFileProvider",
          "android:authorities": authority,
          "android:exported": "false",
          "android:grantUriPermissions": "true",
        },
        "meta-data": [
          {
            $: {
              "android:name": "android.support.FILE_PROVIDER_PATHS",
              "android:resource": "@xml/paseo_update_paths",
            },
          },
        ],
      });
    }
    return result;
  });
};
