import { Buffer } from "buffer";
import { z } from "zod";
import { AgentAttachmentSchema, UploadedFileAttachmentSchema } from "@getpaseo/protocol/messages";
import type { AgentAttachment } from "@getpaseo/protocol/messages";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { FILE_UPLOAD_MAX_BYTES } from "./upload-limit";

export type SharedAttachmentClient = Pick<
  DaemonClient,
  | "readFile"
  | "uploadFile"
  | "createFileEntry"
  | "writeFile"
  | "renameFileEntry"
  | "deleteFileEntry"
  | "listDirectory"
>;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const ManifestSchema = z.object({
  version: z.literal(1),
  clientMessageId: z.string().min(1).max(1024),
  contentKey: z.string().regex(/^[a-f0-9]{64}$/),
  images: z.array(UploadedFileAttachmentSchema).max(100),
  attachments: z.array(AgentAttachmentSchema).max(500),
});
export type SharedMessageAttachments = z.infer<typeof ManifestSchema>;
export interface ShareMessageInput {
  clientMessageId: string;
  images?: Array<{ data: string; mimeType: string; fileName?: string | null }>;
  attachments?: AgentAttachment[];
}

const isMissing = (error: unknown) => error instanceof Error && /\bENOENT\b/.test(error.message);

/** Separate files per message avoid read/modify/write races between devices. The official
 * host owns the files; no changes to its timeline or wire schemas are required. */
export function createSharedMessageStore(
  client: SharedAttachmentClient,
  options: { serverId: string; digest: (text: string) => Promise<string>; home?: string },
) {
  const cwd = options.home ?? "~";
  const directory = options
    .digest(options.serverId)
    .then((id) => `.paseo-latex/attachments-v1/${id}`);
  let ready: Promise<void> | undefined;
  const reads = createSharedReadQueue(4);

  async function ensureDirectory(): Promise<void> {
    ready ??= (async () => {
      const segments = (await directory).split("/");
      let parentPath = ".";
      for (const name of segments) {
        const result = await client.createFileEntry({ cwd, parentPath, name, kind: "directory" });
        parentPath = parentPath === "." ? name : `${parentPath}/${name}`;
        if (!result.success) {
          await client.listDirectory(cwd, parentPath);
        }
      }
    })().catch((error) => {
      ready = undefined;
      throw error;
    });
    await ready;
  }
  async function filePath(key: string) {
    return `${await directory}/${await options.digest(key)}.json`;
  }
  async function readAt(path: string): Promise<SharedMessageAttachments | null> {
    try {
      const file = await reads.run(() => client.readFile(cwd, path, undefined, MAX_MANIFEST_BYTES));
      return ManifestSchema.parse(JSON.parse(Buffer.from(file.bytes).toString("utf8")));
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }
  async function writeAt(path: string, value: SharedMessageAttachments): Promise<void> {
    const content = JSON.stringify(value);
    if (Buffer.byteLength(content) > MAX_MANIFEST_BYTES)
      throw new Error("Attachment metadata exceeds 4 MiB");
    await ensureDirectory();
    const parentPath = await directory;
    const name = `.pending-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
    const temporary = `${parentPath}/${name}`;
    const created = await client.createFileEntry({ cwd, parentPath, name, kind: "file" });
    if (!created.success) throw new Error(created.error ?? "Cannot create attachment metadata");
    try {
      const empty = await client.readFile(cwd, temporary, undefined, MAX_MANIFEST_BYTES);
      const written = await client.writeFile({
        cwd,
        path: temporary,
        content,
        expectedModifiedAt: empty.modifiedAt,
        expectedRevision: empty.revision,
      });
      if (written.status !== "written")
        throw new Error(
          written.status === "error" ? written.error : "Attachment metadata changed while saving",
        );
      const renamed = await client.renameFileEntry({
        cwd,
        path: temporary,
        name: path.slice(path.lastIndexOf("/") + 1),
      });
      if (!renamed.success) {
        const existing = await readAt(path);
        if (
          existing?.clientMessageId !== value.clientMessageId ||
          existing.contentKey !== value.contentKey
        )
          throw new Error(renamed.error ?? "Cannot save attachment metadata");
      }
    } finally {
      await client.deleteFileEntry({ cwd, path: temporary }).catch(() => undefined);
    }
  }
  async function uploadImages(input: NonNullable<ShareMessageInput["images"]>) {
    const images: SharedMessageAttachments["images"] = [];
    for (const [index, image] of input.entries()) {
      const bytes = Buffer.from(image.data, "base64");
      if (bytes.length > FILE_UPLOAD_MAX_BYTES) throw new Error("Shared image exceeds 50 MiB");
      const extension =
        image.mimeType === "image/jpeg"
          ? "jpg"
          : image.mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
      const uploaded = await client.uploadFile({
        bytes,
        mimeType: image.mimeType,
        fileName: image.fileName || `image-${index + 1}.${extension}`,
      });
      if (uploaded.error || !uploaded.file)
        throw new Error(uploaded.error ?? "Image upload failed");
      images.push(uploaded.file);
    }
    return images;
  }
  const clientKey = (id: string) => JSON.stringify(["client", id]);
  const providerKey = (agentId: string, id: string) => JSON.stringify(["provider", agentId, id]);
  return {
    async read(input: {
      clientMessageId?: string;
      agentId?: string;
      messageId?: string;
    }): Promise<SharedMessageAttachments | null> {
      if (input.clientMessageId) {
        const found = await readAt(await filePath(clientKey(input.clientMessageId)));
        if (found) {
          if (found.clientMessageId !== input.clientMessageId)
            throw new Error("Attachment message identity mismatch");
          return found;
        }
      }
      if (input.agentId && input.messageId)
        return readAt(await filePath(providerKey(input.agentId, input.messageId)));
      return null;
    },
    async save(input: ShareMessageInput): Promise<SharedMessageAttachments | null> {
      if (!input.images?.length && !input.attachments?.length) return null;
      const imageKeys: unknown[] = [];
      for (const image of input.images ?? []) {
        if (image.data.length > Math.ceil(FILE_UPLOAD_MAX_BYTES / 3) * 4)
          throw new Error("Shared image exceeds 50 MiB");
        imageKeys.push([await options.digest(image.data), image.mimeType, image.fileName ?? null]);
      }
      const contentKey = await options.digest(JSON.stringify([imageKeys, input.attachments ?? []]));
      const path = await filePath(clientKey(input.clientMessageId));
      const existing = await readAt(path);
      if (existing) {
        if (
          existing.clientMessageId !== input.clientMessageId ||
          existing.contentKey !== contentKey
        )
          throw new Error("Message already has different shared attachments");
        return existing;
      }
      const images = await uploadImages(input.images ?? []);
      const value = ManifestSchema.parse({
        version: 1,
        clientMessageId: input.clientMessageId,
        contentKey,
        images,
        attachments: input.attachments ?? [],
      });
      await writeAt(path, value);
      return value;
    },
    async bind(value: SharedMessageAttachments, agentId: string, messageId: string): Promise<void> {
      const path = await filePath(providerKey(agentId, messageId));
      const existing = await readAt(path);
      if (existing) {
        if (
          existing.clientMessageId !== value.clientMessageId ||
          existing.contentKey !== value.contentKey
        )
          throw new Error("Attachment message identity mismatch");
        return;
      }
      await writeAt(path, value);
    },
  };
}

/** Bound reads separately from the host's shared chat transport. */
export function createSharedReadQueue(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return {
    async run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
      else active += 1;
      try {
        signal?.throwIfAborted();
        return await operation();
      } finally {
        const next = waiting.shift();
        if (next) next();
        else active -= 1;
      }
    },
  };
}
