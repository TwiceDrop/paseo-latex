const { withAppBuildGradle } = require("expo/config-plugins");

const SIGNING_MARKER = "// Paseo LaTeX release signing";
const SIGNING_CONFIG = `
${SIGNING_MARKER}
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
