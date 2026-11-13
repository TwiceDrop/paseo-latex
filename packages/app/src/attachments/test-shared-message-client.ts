import { randomUUID } from "node:crypto";
import { FileTransferOpcode } from "@getpaseo/protocol/binary-frames/index";
import { FileUploadStore } from "../../../server/dist/server/server/file-upload/index.js";
import {
  createExplorerEntry,
  deleteExplorerEntry,
  listDirectoryEntries,
  readExplorerFileBytes,
  renameExplorerEntry,
  writeExplorerFile,
} from "../../../server/dist/server/server/file-explorer/service.js";
import type { SharedAttachmentClient } from "./shared-message-store";

/** Exercise the official host's unchanged file operations against a real temporary home. */
export function createSharedMessageTestClient(home: string): SharedAttachmentClient {
  const uploads = new FileUploadStore({ paseoHome: home });
  const rootFor = (cwd: string) => (cwd === "~" ? home : cwd);
  return {
    async readFile(cwd, path, _id, maxBytes) {
      const file = await readExplorerFileBytes({ root: rootFor(cwd), relativePath: path });
      if (maxBytes && file.size > maxBytes) throw new Error("File exceeds read limit");
      return { ...file, mime: file.mimeType ?? "application/octet-stream" };
    },
    async createFileEntry({ cwd, parentPath, name, kind }) {
      const result = await createExplorerEntry({ root: rootFor(cwd), parentPath, name, kind });
      return {
        requestId: "test",
        cwd,
        parentPath,
        path: result.status === "ok" ? result.path : null,
        success: result.status === "ok",
        error: result.status === "ok" ? null : result.error,
      };
    },
    async renameFileEntry({ cwd, path, name }) {
      const result = await renameExplorerEntry({ root: rootFor(cwd), relativePath: path, name });
      return {
        requestId: "test",
        cwd,
        path,
        renamedPath: result.status === "ok" ? result.path : null,
        success: result.status === "ok",
        error: result.status === "ok" ? null : result.error,
      };
    },
    async deleteFileEntry({ cwd, path }) {
      const result = await deleteExplorerEntry({ root: rootFor(cwd), relativePath: path });
      return {
        requestId: "test",
        cwd,
        path,
        success: result.status === "ok",
        error: result.status === "ok" ? null : result.error,
      };
    },
    writeFile: ({ cwd, path, ...input }) =>
      writeExplorerFile({ root: rootFor(cwd), relativePath: path, ...input }),
    async listDirectory(cwd, path) {
      return listDirectoryEntries({ root: rootFor(cwd), relativePath: path });
    },
    async uploadFile(input) {
      const requestId = randomUUID();
      const bytes = new Uint8Array(input.bytes);
      uploads.beginUpload({
        type: "file.upload.request",
        requestId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        size: bytes.length,
        modifiedAt: new Date().toISOString(),
      });
      await uploads.receiveFrame({
        opcode: FileTransferOpcode.FileBegin,
        requestId,
        payload: new Uint8Array(),
        metadata: {
          mime: input.mimeType,
          size: bytes.length,
          encoding: "binary",
          modifiedAt: new Date().toISOString(),
          fileName: input.fileName,
        },
      });
      await uploads.receiveFrame({
        opcode: FileTransferOpcode.FileChunk,
        requestId,
        payload: bytes,
      });
      const response = await uploads.receiveFrame({
        opcode: FileTransferOpcode.FileEnd,
        requestId,
        payload: new Uint8Array(),
      });
      if (!response) throw new Error("Upload did not complete");
      return response.payload;
    },
  };
}
