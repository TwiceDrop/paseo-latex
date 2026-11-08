import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import type { DocumentKind } from "./model";
import { documentRuntimeAssets } from "./runtime/assets.gen";

export async function loadDocumentRuntime(kind: DocumentKind): Promise<string> {
  // Asset copies the packaged Android resource to a readable local cache file.
  // The WebView itself keeps its about:blank source and file-access restrictions.
  const asset = await Asset.fromModule(documentRuntimeAssets[kind]).downloadAsync();
  if (!asset.localUri) throw new Error("Document preview resource is unavailable");
  return new File(asset.localUri).text();
}
