import { afterEach, describe, expect, it } from "vitest";
import type { AttachmentMetadata, AttachmentStore, SaveAttachmentInput } from "@/attachments/types";
import { __setAttachmentStoreForTests } from "./store";
import {
  encodeAttachmentsForSend,
  garbageCollectAttachments,
  persistAttachmentFromBytes,
} from "./service";

function createAttachment(input: Partial<AttachmentMetadata> = {}): AttachmentMetadata {
  return {
    id: input.id ?? "att_1",
    mimeType: input.mimeType ?? "image/png",
    storageType: input.storageType ?? "web-indexeddb",
    storageKey: input.storageKey ?? "att_1",
    fileName: input.fileName,
    byteSize: input.byteSize,
    createdAt: input.createdAt ?? 1700000000000,
  };
}

function createRecordingStore(): AttachmentStore & {
  savedSources: SaveAttachmentInput[];
  releasedUrls: string[];
} {
  const savedSources: SaveAttachmentInput[] = [];
  const releasedUrls: string[] = [];

  return {
    storageType: "web-indexeddb",
    savedSources,
    releasedUrls,
    async save(input) {
      savedSources.push(input);
      return createAttachment({
        id: input.id,
        mimeType: input.mimeType,
        fileName: input.fileName,
        byteSize: 4,
      });
    },
    async encodeBase64({ attachment }) {
      return `${attachment.id}:base64`;
    },
    async resolvePreviewUrl({ attachment }) {
      return `blob:${attachment.id}`;
    },
    async releasePreviewUrl({ url }) {
      releasedUrls.push(url);
    },
    async delete() {},
    async garbageCollect() {},
  };
}

describe("attachment service", () => {
  afterEach(() => {
    __setAttachmentStoreForTests(null);
  });

  it("persists raw bytes without requiring a base64 wrapper", async () => {
    const store = createRecordingStore();
    __setAttachmentStoreForTests(store);
    const bytes = new Uint8Array([0, 1, 2, 3]);

    const attachment = await persistAttachmentFromBytes({
      id: "att_bytes",
      bytes,
      mimeType: "image/png",
      fileName: "image.png",
    });

    expect(attachment).toEqual({
      id: "att_bytes",
      mimeType: "image/png",
      storageType: "web-indexeddb",
      storageKey: "att_1",
      fileName: "image.png",
      byteSize: 4,
      createdAt: 1700000000000,
    });
    expect(store.savedSources).toEqual([
      {
        id: "att_bytes",
        mimeType: "image/png",
        fileName: "image.png",
        source: { kind: "bytes", bytes },
      },
    ]);
  });

  it("keeps provider send output byte-compatible", async () => {
    const store = createRecordingStore();
    __setAttachmentStoreForTests(store);
    const attachment = createAttachment({ id: "att_send", mimeType: "image/jpeg" });

    await expect(encodeAttachmentsForSend([attachment])).resolves.toEqual([
      { data: "att_send:base64", mimeType: "image/jpeg" },
    ]);
  });

  it("does not collect an attachment persisted while garbage collection is starting", async () => {
    let releaseSave: () => void = () => undefined;
    let reportSaveStarted: () => void = () => undefined;
    const saveStarted = new Promise<void>((resolve) => {
      reportSaveStarted = resolve;
    });
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const garbageCollections: string[][] = [];
    const store: AttachmentStore = {
      ...createRecordingStore(),
      async save(input) {
        reportSaveStarted();
        await saveGate;
        return createAttachment({ id: input.id });
      },
      async garbageCollect({ referencedIds }) {
        garbageCollections.push([...referencedIds]);
      },
    };
    __setAttachmentStoreForTests(store);

    const persist = persistAttachmentFromBytes({
      id: "assistant-preview",
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
    });
    await saveStarted;
    const collect = garbageCollectAttachments({ referencedIds: new Set() });

    try {
      await Promise.resolve();
      expect(garbageCollections).toEqual([]);
    } finally {
      releaseSave();
      await Promise.all([persist, collect]);
    }

    expect(garbageCollections).toEqual([["assistant-preview"]]);
  });
});

describe("shared message attachments on an official host", () => {
  it("restores an image and file on a fresh client with no sender cache", async () => {
    const { mkdtemp, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { createHash } = await import("node:crypto");
    const { createSharedMessageTestClient } = await import("./test-shared-message-client");
    const { createSharedMessageStore } = await import("./shared-message-store");
    const home = await mkdtemp(`${tmpdir()}/paseo-shared-attachments-`);
    const options = {
      home,
      serverId: "official-host",
      digest: async (text: string) => createHash("sha256").update(text).digest("hex"),
    };
    try {
      const sender = createSharedMessageTestClient(home);
      const file = await sender.uploadFile({
        fileName: "报告.txt",
        mimeType: "text/plain",
        bytes: Buffer.from("attachment contents"),
      });
      expect(file.error).toBeNull();
      const saved = await createSharedMessageStore(sender, options).save({
        clientMessageId: "draft:initial-message",
        images: [{ data: "AQIDBA==", mimeType: "image/png", fileName: "图片.png" }],
        attachments: [file.file!],
      });
      const receiver = createSharedMessageStore(createSharedMessageTestClient(home), options);
      const restored = await receiver.read({ clientMessageId: "draft:initial-message" });
      expect(restored).toEqual(saved);
      expect(await readFile(restored!.images[0]!.path)).toEqual(Buffer.from([1, 2, 3, 4]));
      expect(restored!.attachments).toEqual([file.file]);
      expect(await readFile(file.file!.path, "utf8")).toBe("attachment contents");
      await receiver.bind(restored!, "agent-1", "provider-message-1");
      expect(
        await createSharedMessageStore(createSharedMessageTestClient(home), options).read({
          agentId: "agent-1",
          messageId: "provider-message-1",
        }),
      ).toEqual(saved);
      expect(
        await receiver.read({ agentId: "agent-2", messageId: "provider-message-1" }),
      ).toBeNull();
      expect(
        await createSharedMessageStore(sender, { ...options, serverId: "other-host" }).read({
          clientMessageId: "draft:initial-message",
        }),
      ).toBeNull();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe("shared attachment persistence failures", () => {
  it("keeps simultaneous sends separate and rejects a changed retry", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { createHash } = await import("node:crypto");
    const { createSharedMessageTestClient } = await import("./test-shared-message-client");
    const { createSharedMessageStore } = await import("./shared-message-store");
    const home = await mkdtemp(`${tmpdir()}/paseo-shared-concurrent-`);
    const options = {
      home,
      serverId: "official-host",
      digest: async (text: string) => createHash("sha256").update(text).digest("hex"),
    };
    try {
      const a = createSharedMessageStore(createSharedMessageTestClient(home), options);
      const b = createSharedMessageStore(createSharedMessageTestClient(home), options);
      const one = {
        clientMessageId: "one",
        attachments: [
          {
            type: "text" as const,
            mimeType: "text/plain" as const,
            text: "first",
            title: "one.txt",
          },
        ],
      };
      const two = {
        clientMessageId: "two",
        attachments: [
          {
            type: "text" as const,
            mimeType: "text/plain" as const,
            text: "second",
            title: "two.txt",
          },
        ],
      };
      const [savedOne, savedTwo] = await Promise.all([a.save(one), b.save(two)]);
      expect(await b.read(one)).toEqual(savedOne);
      expect(await a.read(two)).toEqual(savedTwo);
      expect(await b.save(one)).toEqual(savedOne);
      await expect(a.save({ ...two, clientMessageId: "one" })).rejects.toThrow(
        "different shared attachments",
      );
      expect(await b.read(one)).toEqual(savedOne);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("does not publish incomplete metadata and can retry after a disk write failure", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { createHash } = await import("node:crypto");
    const { createSharedMessageTestClient } = await import("./test-shared-message-client");
    const { createSharedMessageStore } = await import("./shared-message-store");
    const home = await mkdtemp(`${tmpdir()}/paseo-shared-failed-`);
    const options = {
      home,
      serverId: "official-host",
      digest: async (text: string) => createHash("sha256").update(text).digest("hex"),
    };
    try {
      const client = createSharedMessageTestClient(home);
      const reader = createSharedMessageStore(client, options);
      const failing = createSharedMessageStore(
        { ...client, writeFile: async () => ({ status: "error", error: "Disk full" }) },
        options,
      );
      const input = {
        clientMessageId: "retry",
        attachments: [
          {
            type: "text" as const,
            mimeType: "text/plain" as const,
            text: "keep this",
            title: "context",
          },
        ],
      };
      await expect(failing.save(input)).rejects.toThrow("Disk full");
      expect(await reader.read(input)).toBeNull();
      const saved = await reader.save(input);
      expect(await createSharedMessageStore(client, options).read(input)).toEqual(saved);
      expect(
        (
          await client.listDirectory(
            home,
            `.paseo-latex/attachments-v1/${await options.digest(options.serverId)}`,
          )
        ).entries.map((e) => e.name),
      ).toHaveLength(1);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
