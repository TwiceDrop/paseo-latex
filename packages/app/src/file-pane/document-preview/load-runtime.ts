import { loadBundledHtml } from "@/utils/load-bundled-html";
import type { DocumentKind } from "./model";
import { documentRuntimeAssets } from "./runtime/assets.gen";

export async function loadDocumentRuntime(kind: DocumentKind): Promise<string> {
  return loadBundledHtml(documentRuntimeAssets[kind]);
}
