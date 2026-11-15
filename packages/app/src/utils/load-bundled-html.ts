import { Asset } from "expo-asset";
import { File } from "expo-file-system";

/** Read a packaged asset without granting the viewer filesystem or network access. */
export async function loadBundledHtml(module: number): Promise<string> {
  const asset = await Asset.fromModule(module).downloadAsync();
  if (!asset.localUri) throw new Error("Preview resource is unavailable");
  return new File(asset.localUri).text();
}
