import { requireNativeModule } from "expo-modules-core";

export async function saveDownloadedFile(
  uri: string,
  fileName: string,
  mimeType: string,
): Promise<string | null> {
  return requireNativeModule<{
    saveFileAsync(uri: string, fileName: string, mimeType: string): Promise<string | null>;
  }>("PaseoFileDownload").saveFileAsync(uri, fileName, mimeType);
}
