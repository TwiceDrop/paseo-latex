import type { AttachmentMetadata } from "./types";
import type { AgentAttachment } from "@getpaseo/protocol/messages";
import { DaemonConnectionError } from "@getpaseo/client/internal/daemon-client";
import { i18n } from "@/i18n/i18next";
import { createSharedMessageStore, type SharedAttachmentClient } from "./shared-message-store";

export interface SharedMessageClient extends SharedAttachmentClient {
  getLastServerInfoMessage(): {
    serverId: string;
    features?: { workspaceFileEditing?: boolean; canonicalSubmittedPrompts?: boolean };
  } | null;
}
const stores = new WeakMap<
  SharedMessageClient,
  { serverId: string; store: ReturnType<typeof createSharedMessageStore> }
>();

export function getSharedMessageStore(client: SharedMessageClient) {
  const info = client.getLastServerInfoMessage();
  if (!info) {
    throw new DaemonConnectionError(i18n.t("common.errors.daemonClientDisconnected"));
  }
  // COMPAT(sharedMessageFiles): added in latex-v0.15.4-r3. Keep until official hosts
  // publish durable attachment references in canonical user messages.
  if (!info.features?.workspaceFileEditing || !info.features.canonicalSubmittedPrompts) {
    throw new Error(i18n.t("message.attachments.sharedHostRequired"));
  }
  const existing = stores.get(client);
  if (existing?.serverId === info.serverId) return existing.store;
  const store = createSharedMessageStore(client, {
    serverId: info.serverId,
    digest: async (text) => {
      // Load the native hashing boundary only when reading or sharing attachments.
      const { CryptoDigestAlgorithm, digestStringAsync } = await import("expo-crypto");
      return digestStringAsync(CryptoDigestAlgorithm.SHA256, text);
    },
  });
  stores.set(client, { serverId: info.serverId, store });
  return store;
}

export function isSharedAttachmentConnectionError(error: unknown): boolean {
  if (error instanceof DaemonConnectionError) return true;
  return error instanceof Error && error.cause instanceof DaemonConnectionError;
}

export function retrySharedAttachmentRead(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && isSharedAttachmentConnectionError(error);
}

export async function shareMessageAttachments(
  client: SharedMessageClient,
  input: {
    clientMessageId: string;
    images?: AttachmentMetadata[];
    encodedImages?: Array<{ data: string; mimeType: string }>;
    attachments?: AgentAttachment[];
  },
) {
  if (!input.images?.length && !input.attachments?.length) return null;
  if ((input.images?.length ?? 0) !== (input.encodedImages?.length ?? 0)) {
    throw new Error(i18n.t("message.attachments.sharedImagesMissing"));
  }
  // COMPAT(legacyGithubAttachments): hosts predating canonical prompts accept these
  // self-contained references in the message RPC. There are no local bytes to upload.
  if (
    !input.images?.length &&
    input.attachments?.every(({ type }) => type === "github_issue" || type === "github_pr")
  ) {
    const info = client.getLastServerInfoMessage();
    if (info && !info.features?.canonicalSubmittedPrompts) return null;
  }
  try {
    return await getSharedMessageStore(client).save({
      clientMessageId: input.clientMessageId,
      images: input.encodedImages?.map((image, index) => ({
        ...image,
        fileName: input.images?.[index]?.fileName,
      })),
      attachments: input.attachments,
    });
  } catch (error) {
    throw new Error(
      i18n.t("message.attachments.sharedSaveFailed", {
        error: error instanceof Error ? error.message : String(error),
      }),
      { cause: error },
    );
  }
}
