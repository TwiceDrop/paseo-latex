import { z } from "zod";
import { getLatexVersionCode } from "../../native-release-version.mjs";

export const LATEX_RELEASE_URL = "https://cnb.cool/twicedrop/paseo-latex/-/releases/latest";
const releaseSchema = z.object({
  tag_name: z.string(),
  draft: z.literal(false),
  prerelease: z.literal(false),
  assets: z.array(
    z.object({
      name: z.string(),
      size: z
        .number()
        .int()
        .positive()
        .max(1024 * 1024 * 1024),
      hash_algo: z.string(),
      hash_value: z.string(),
    }),
  ),
});

export interface LatexRelease {
  version: string;
  revision: number;
  versionCode: number;
  label: string;
  url: string;
  size: number;
  sha256: string;
}

export function parseLatexRelease(value: unknown): LatexRelease {
  const release = releaseSchema.parse(value);
  const match = /^latex-v(\d+\.\d+\.\d+)-r([1-9]\d?)$/.exec(release.tag_name);
  if (!match) throw new Error("CNB returned an unsupported personal release");
  const version = match[1];
  const revision = Number(match[2]);
  const label = `${version}-r${revision}`;
  const fileName = `paseo-latex-${label}.apk`;
  const assets = release.assets.filter((asset) => asset.name === fileName);
  if (
    assets.length !== 1 ||
    assets[0].hash_algo !== "sha256" ||
    !/^[a-f0-9]{64}$/i.test(assets[0].hash_value)
  ) {
    throw new Error("CNB release is missing a verified personal APK");
  }
  return {
    version,
    revision,
    versionCode: getLatexVersionCode(version, revision),
    label,
    url: `https://cnb.cool/twicedrop/paseo-latex/-/releases/download/${release.tag_name}/${fileName}`,
    size: assets[0].size,
    sha256: assets[0].hash_value.toLowerCase(),
  };
}

export async function checkLatexRelease(signal: AbortSignal): Promise<LatexRelease> {
  const response = await fetch(LATEX_RELEASE_URL, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(`CNB: HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > 512 * 1024) throw new Error("CNB release response is too large");
  return parseLatexRelease(JSON.parse(body));
}
