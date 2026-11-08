import { Buffer } from "buffer";
import type { DocumentKind } from "./model";
import type { DocumentLabels, DocumentRequest } from "./messages";

export function documentPreviewHtml(input: {
  runtimeHtml: string;
  bytes: Uint8Array;
  kind: DocumentKind;
  labels: DocumentLabels;
}): string {
  const request: DocumentRequest = {
    kind: input.kind,
    base64: Buffer.from(
      input.bytes.buffer,
      input.bytes.byteOffset,
      input.bytes.byteLength,
    ).toString("base64"),
    labels: input.labels,
  };
  const json = JSON.stringify(request).replace(/</g, "\\u003c");
  return input.runtimeHtml.replace(
    "/*PASEO_DOCUMENT_REQUEST*/",
    () => `window.__paseoDocument=${json};`,
  );
}
