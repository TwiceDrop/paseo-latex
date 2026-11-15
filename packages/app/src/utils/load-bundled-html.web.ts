import { Asset } from "expo-asset";

export async function loadBundledHtml(module: number): Promise<string> {
  const asset = Asset.fromModule(module);
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error("Preview resource is unavailable");
  return response.text();
}
