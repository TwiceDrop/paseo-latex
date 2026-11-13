import Constants from "expo-constants";

export const isLatexBuild = Constants.expoConfig?.extra?.latexBuild === true;
export const latexBuildRevision = isLatexBuild
  ? Number(Constants.expoConfig?.extra?.latexRevision ?? 1)
  : null;
