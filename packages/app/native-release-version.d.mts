export function getNativeReleaseVersion(version: string): {
  appVersion: string;
  androidVersionCode: number;
  iosBuildNumber: string;
};
export function getLatexVersionCode(version: string, revision: number): number;
export function getFdroidVersionCodes(version: string): { abi: string; versionCode: number }[];
export const FDROID_ABI_VERSION_CODE_SUFFIXES: Record<string, number>;
