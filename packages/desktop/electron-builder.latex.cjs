const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");
const base = yaml.load(fs.readFileSync(path.join(__dirname, "electron-builder.yml"), "utf8"));
const { version } = require("./package.json");
const revision = Number(process.env.PASEO_LATEX_WINDOWS_REVISION || "1");
if (!Number.isInteger(revision) || revision < 1 || revision > 99)
  throw new Error("Invalid Windows revision");

module.exports = {
  ...base,
  appId: "sh.paseo.latex.desktop",
  productName: "Paseo LaTeX",
  executableName: "PaseoLaTeX",
  // Do not replace the official paseo: URL handler.
  protocols: [],
  publish: null,
  // Daemon version comparison uses app.getVersion(); keep it equal to upstream.
  extraMetadata: { paseoDistribution: "latex", paseoLatexRevision: revision, version },
  buildVersion: `${version}.${revision}`,
  directories: { output: `../../artifacts/windows-latex-${version}-r${revision}` },
  compression: "normal",
  extraResources: [
    ...base.extraResources,
    { from: "assets/latex-daemon-config.json", to: "latex-daemon-config.json" },
  ],
  win: {
    ...base.win,
    target: [{ target: "nsis", arch: ["x64"] }],
    artifactName: `Paseo-LaTeX-Setup-${version}-r${revision}-\${arch}.\${ext}`,
    extraResources: [{ from: "bin/paseo-latex.cmd", to: "bin/paseo.cmd" }],
  },
  nsis: {
    ...base.nsis,
    guid: "485dbf2e-2f44-4f3b-b907-c643626d0a2c",
    shortcutName: "Paseo LaTeX",
    uninstallDisplayName: "Paseo LaTeX",
    deleteAppDataOnUninstall: false,
  },
};
