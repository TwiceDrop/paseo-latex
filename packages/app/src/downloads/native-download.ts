import { File, Paths } from "expo-file-system";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { saveDownloadedFile } from "./save-file";

export async function downloadNativeFile(input: {
  client: DaemonClient;
  cwd: string;
  path: string;
  fileName: string;
  onProgress(bytesWritten: number, totalBytes: number): void;
  onSaving(): void;
}): Promise<string | null> {
  // A temporary cache file receives chunks directly; document providers own the final location.
  const file = new File(
    Paths.cache,
    `paseo-download-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  file.create();
  const handle = file.open();
  let closed = false;
  try {
    const metadata = await input.client.downloadFile(input.cwd, input.path, {
      write: (bytes) => handle.writeBytes(bytes),
      progress: input.onProgress,
    });
    handle.close();
    closed = true;
    input.onSaving();
    return await saveDownloadedFile(file.uri, input.fileName, metadata.mime);
  } finally {
    if (!closed) handle.close();
    if (file.exists) file.delete();
  }
}
