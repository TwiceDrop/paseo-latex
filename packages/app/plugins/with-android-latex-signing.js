const { withAppBuildGradle, withProjectBuildGradle } = require("expo/config-plugins");

const TOOLCHAIN_MARKER = "// Paseo LaTeX native toolchain";
const TOOLCHAIN_CONFIG = `
${TOOLCHAIN_MARKER}
subprojects { nativeProject ->
    ['com.android.application', 'com.android.library'].each { androidPlugin ->
        nativeProject.plugins.withId(androidPlugin) {
            nativeProject.android.ndkVersion = rootProject.ext.ndkVersion
        }
    }
}
`;

const SIGNING_MARKER = "// Paseo LaTeX release signing";
const SIGNING_CONFIG = `
${SIGNING_MARKER}
// RN's Windows CLI paths are relative to the app, while Expo resolves from the workspace.
if (System.getProperty('os.name').toLowerCase().contains('windows')) {
    react {
        extraPackagerArgs.addAll(['--entry-file', entryFile.get().asFile.absolutePath])
    }
    android {
        externalNativeBuild {
            cmake {
                buildStagingDirectory rootProject.file('../../../.dev/cxx')
            }
        }
        defaultConfig {
            externalNativeBuild {
                cmake {
                    arguments '-DCMAKE_OBJECT_PATH_MAX=240'
                }
            }
        }
    }
}
if ((findProperty('paseoLatexLowMemoryBuild') ?: 'false').toBoolean()) {
    react {
        hermesFlags = ['-Og', '-output-source-map']
    }
}
android {
    signingConfigs {
        paseoLatex {
            storeType 'PKCS12'
            def latexKeystore = System.getenv('PASEO_LATEX_KEYSTORE')
            if (latexKeystore) {
                storeFile file(latexKeystore)
                storePassword System.getenv('PASEO_LATEX_STORE_PASSWORD')
                keyAlias System.getenv('PASEO_LATEX_KEY_ALIAS')
                keyPassword System.getenv('PASEO_LATEX_KEY_PASSWORD')
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.paseoLatex
        }
    }
}
`;

function withAndroidLatexSigning(config) {
  config = withProjectBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== "groovy") {
      throw new Error("Paseo LaTeX requires the Expo Groovy build configuration");
    }
    if (!modConfig.modResults.contents.includes(TOOLCHAIN_MARKER)) {
      modConfig.modResults.contents += TOOLCHAIN_CONFIG;
    }
    return modConfig;
  });
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== "groovy") {
      throw new Error("Paseo LaTeX signing requires the Expo Groovy build configuration");
    }
    if (!modConfig.modResults.contents.includes(SIGNING_MARKER)) {
      modConfig.modResults.contents += SIGNING_CONFIG;
    }
    return modConfig;
  });
}

module.exports = withAndroidLatexSigning;
