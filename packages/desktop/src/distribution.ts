import { readFileSync } from "node:fs";
import path from "node:path";

// Written into the packaged manifest by electron-builder.latex.cjs. Runtime
// environment variables must not turn an official install into a personal one.
const manifest = JSON.parse(readFileSync(path.join(__dirname, "../package.json"), "utf8")) as {
  paseoDistribution?: string;
};
export const isLatexDesktop = manifest.paseoDistribution === "latex";
export const desktopProductName = isLatexDesktop ? "Paseo LaTeX" : "Paseo";
export const desktopAppId = isLatexDesktop ? "sh.paseo.latex.desktop" : "sh.paseo.desktop";
