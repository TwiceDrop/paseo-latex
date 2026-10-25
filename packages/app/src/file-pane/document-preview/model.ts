import type { FileReadResult } from "@getpaseo/client/internal/daemon-client";

export type DocumentKind = "word" | "slides" | "sheet" | "pdf" | "text" | "legacy";
export const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;

const kinds: Record<string, DocumentKind> = {
  docx: "word",
  dotx: "word",
  docm: "word",
  pptx: "slides",
  ppsx: "slides",
  potx: "slides",
  xlsx: "sheet",
  xlsm: "sheet",
  xltx: "sheet",
  xls: "sheet",
  xlsb: "sheet",
  ods: "sheet",
  csv: "sheet",
  tsv: "sheet",
  pdf: "pdf",
  txt: "text",
  log: "text",
  ini: "text",
  conf: "text",
  cfg: "text",
  env: "text",
  doc: "legacy",
  ppt: "legacy",
};

export function documentPreviewKind(path: string): DocumentKind | null {
  const name = path.trim().split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const extension = name.slice(dot + 1).toLowerCase();
  return Object.hasOwn(kinds, extension) ? kinds[extension] : null;
}

export interface DocumentReader {
  readFile(
    cwd: string,
    path: string,
    requestId?: string,
    maxBytes?: number,
  ): Promise<FileReadResult>;
}

export async function readPreviewDocument(input: {
  reader: DocumentReader;
  cwd: string;
  path: string;
}): Promise<Uint8Array> {
  const file = await input.reader.readFile(input.cwd, input.path, undefined, MAX_DOCUMENT_BYTES);
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("File is too large to display");
  if (file.bytes.byteLength !== file.size)
    throw new Error("File transfer incomplete. Retry the preview.");
  return file.bytes;
}

/** Check the ZIP directory before Office parsers expand compressed document parts. */
export function checkOfficeArchive(bytes: Uint8Array): void {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return;
  if (bytes.length < 22) throw new Error("Invalid Office archive");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  const earliest = Math.max(0, end - 65535);
  while (end >= earliest && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < earliest) throw new Error("Invalid Office archive");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count > 20000 || offset === 0xffffffff) throw new Error("Office archive is too large");
  let expanded = 0;
  for (let entry = 0; entry < count; entry++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error("Invalid Office archive");
    expanded += view.getUint32(offset + 24, true);
    if (expanded > 128 * 1024 * 1024) throw new Error("Expanded Office document is too large");
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
}
