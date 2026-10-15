import * as Sharing from "expo-sharing";

export async function saveDownloadedFile(
  uri: string,
  fileName: string,
  mimeType: string,
): Promise<string | null> {
  if (!(await Sharing.isAvailableAsync())) throw new Error("File sharing is unavailable.");
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: fileName });
  return uri;
}
