import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { QueryClient } from "@tanstack/react-query";
import { decodeDocumentText } from "./runtime/text";
import { decodeBase64 } from "./runtime/base64";
import type { FileReadResult } from "@getpaseo/client/internal/daemon-client";
import {
  checkOfficeArchive,
  documentPreviewKind,
  MAX_DOCUMENT_BYTES,
  readPreviewDocument,
  shareDocumentBytes,
} from "./model";

describe("document previews", () => {
  it("keeps an unchanged revalidated document stable and publishes changed bytes", async () => {
    const client = new QueryClient();
    const original = new Uint8Array([1, 2, 3]);
    // Match a transfer whose bytes are a view into a larger network buffer.
    const unchanged = new Uint8Array([9, 1, 2, 3, 9]).subarray(1, 4);
    const changed = new Uint8Array([1, 2, 4]);
    const responses = [original, unchanged, changed, new Uint8Array()];
    const options = {
      queryKey: ["document-revalidation"],
      queryFn: async () => responses.shift()!,
      structuralSharing: shareDocumentBytes,
      staleTime: 0,
    };
    try {
      await client.fetchQuery(options);
      expect(client.getQueryData(options.queryKey)).toBe(original);
      await client.fetchQuery(options);
      expect(client.getQueryData(options.queryKey)).toBe(original);
      await client.fetchQuery(options);
      expect(client.getQueryData(options.queryKey)).toBe(changed);
      await client.fetchQuery(options);
      expect(client.getQueryData(options.queryKey)).toEqual(new Uint8Array());
    } finally {
      client.clear();
    }
  });
  it("decodes every byte value without changing binary documents, including empty data", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    expect(decodeBase64(Buffer.from(bytes).toString("base64"))).toEqual(bytes);
    expect(decodeBase64("")).toEqual(new Uint8Array());
  });
  it("recognizes Office, PDF and text without intercepting code, Markdown or images", () => {
    expect(
      [
        "FILE.DOCX",
        "C:\\docs\\slides.pptx",
        "budget.xls",
        "report.pdf",
        "notes.log",
        "table.csv",
      ].map(documentPreviewKind),
    ).toEqual(["word", "slides", "sheet", "pdf", "text", "sheet"]);
    expect(["main.ts", "README.md", "image.png", "a.docx.exe"].map(documentPreviewKind)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it("does not classify inherited object properties as document formats", () => {
    expect(["a.constructor", "a.__proto__", "a.toString"].map(documentPreviewKind)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("decodes UTF-8, BOM-marked UTF-16 and legacy Chinese text", () => {
    expect(decodeDocumentText(new TextEncoder().encode("项目,金额"))).toBe("项目,金额");
    expect(decodeDocumentText(new Uint8Array([0xff, 0xfe, 0x2d, 0x4e, 0x87, 0x65]))).toBe("中文");
    expect(decodeDocumentText(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]))).toBe("中文");
  });

  it("uses the existing connection's bounded binary read", async () => {
    const bytes = new Uint8Array([1, 2]);
    const requests: unknown[] = [];
    const reader = {
      async readFile(...args: unknown[]): Promise<FileReadResult> {
        requests.push(args);
        return {
          bytes,
          size: 2,
          path: "a.pdf",
          mime: "application/pdf",
          kind: "binary",
          modifiedAt: "now",
        };
      },
    };
    await expect(readPreviewDocument({ reader, cwd: "/repo", path: "a.pdf" })).resolves.toBe(bytes);
    expect(requests).toEqual([["/repo", "a.pdf", undefined, MAX_DOCUMENT_BYTES]]);
  });

  it("rejects truncated legacy file content", async () => {
    const reader = {
      async readFile(): Promise<FileReadResult> {
        return {
          bytes: new Uint8Array(),
          size: 10,
          path: "a.pdf",
          mime: "application/pdf",
          kind: "binary",
          modifiedAt: "now",
        };
      },
    };
    await expect(readPreviewDocument({ reader, cwd: "/repo", path: "a.pdf" })).rejects.toThrow(
      "File transfer incomplete",
    );
  });

  it("bounds the expanded size before Office libraries decompress ZIP data", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", "valid XML text");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    expect(() => checkOfficeArchive(bytes)).not.toThrow();
    const view = new DataView(bytes.buffer);
    const directory = view.getUint32(bytes.length - 6, true);
    view.setUint32(directory + 24, 129 * 1024 * 1024, true);
    expect(() => checkOfficeArchive(bytes)).toThrow("Expanded Office document is too large");
  });
});
