import { Asset } from "expo-asset";
import type { DocumentKind } from "./model";
import { documentRuntimeAssets } from "./runtime/assets.gen";

export async function loadDocumentRuntime(kind: DocumentKind): Promise<string> {
  const asset = Asset.fromModule(documentRuntimeAssets[kind]);
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error("Document preview resource is unavailable");
  return response.text();
}
