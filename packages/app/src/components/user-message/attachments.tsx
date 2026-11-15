import { createSharedReadQueue } from "@/attachments/shared-message-store";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { DaemonConnectionError, type DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { AgentAttachment, UploadedFileAttachment } from "@getpaseo/protocol/messages";
import type { AttachmentMetadata } from "@/attachments/types";
import {
  getSharedMessageStore,
  isSharedAttachmentConnectionError,
  retrySharedAttachmentRead,
  shareMessageAttachments,
} from "@/attachments/shared-message-runtime";
import { getAgentAttachmentPillContent } from "@/attachments/attachment-pill-content";
import { encodeImages } from "@/utils/encode-images";
import {
  persistAttachmentFromBytes,
  resolveAttachmentPreviewUrl,
  releaseAttachmentPreviewUrl,
} from "@/attachments/service";
import { retainAttachmentForGarbageCollection } from "@/attachments/gc-retention";
import { resolveFilePreviewReadTarget } from "@/file-explorer/preview-target";
import { createAssistantImageAcquisitionCache } from "@/assistant-image/acquisition-cache";
import { useFetchQuery } from "@/data/query";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useAppVisible } from "@/hooks/use-app-visible";
import { getHostRuntimeStore, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { i18n } from "@/i18n/i18next";
import { useFileLink } from "@/assistant-file-links";
import {
  AttachmentFrame,
  AttachmentLabel,
  AttachmentThumbnail,
} from "@/components/attachment-pill";
import { AttachmentLightbox } from "@/components/attachment-lightbox";
import { Button } from "@/components/ui/button";

const imageReads = createSharedReadQueue(2);
const EMPTY_IMAGES: AttachmentMetadata[] = [];
const EMPTY_ATTACHMENTS: AgentAttachment[] = [];
const imageCache = createAssistantImageAcquisitionCache<AttachmentMetadata>({
  capacity: 24,
  onRetain: (metadata) => retainAttachmentForGarbageCollection(metadata.id),
});

function currentAttachmentClient(serverId: string | undefined): DaemonClient {
  const client = serverId ? getHostRuntimeStore().getClient(serverId) : null;
  if (!client) throw new DaemonConnectionError(i18n.t("common.errors.daemonClientDisconnected"));
  return client;
}

export interface UserMessageAttachmentProps {
  client?: DaemonClient | null;
  serverId?: string;
  agentId?: string;
  clientMessageId?: string;
  messageId?: string;
  images?: AttachmentMetadata[];
  attachments?: AgentAttachment[];
  isPending: boolean;
}

export function UserMessageAttachments(props: UserMessageAttachmentProps) {
  const { t } = useTranslation();
  const images = props.images ?? EMPTY_IMAGES;
  const attachments = props.attachments ?? EMPTY_ATTACHMENTS;
  const { query, enabled, connected } = useSharedAttachments(props, images, attachments);
  const [lightbox, setLightbox] = useState<AttachmentMetadata | null>(null);
  const close = useCallback(() => setLightbox(null), []);
  const lightboxSource = useMemo(
    () => (lightbox ? { type: "attachment" as const, metadata: lightbox } : null),
    [lightbox],
  );
  const shownAttachments = attachments.length
    ? attachments
    : (query.data?.attachments ?? EMPTY_ATTACHMENTS);
  const remoteImages = query.data?.images ?? [];
  const refetch = query.refetch;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  return (
    <>
      {images.length || remoteImages.length ? (
        <View style={styles.row}>
          {remoteImages.length
            ? remoteImages.map((image, index) => (
                <SharedImage
                  key={image.id}
                  image={image}
                  serverId={props.serverId!}
                  enabled={enabled}
                  connected={connected}
                  onOpen={setLightbox}
                  localImage={images[index]}
                />
              ))
            : images.map((image) => (
                <LocalImage key={image.id} image={image} onOpen={setLightbox} />
              ))}
        </View>
      ) : null}
      {shownAttachments.length ? (
        <View style={styles.row}>
          {shownAttachments.map((attachment) => (
            <MessageAttachment key={JSON.stringify(attachment)} attachment={attachment} />
          ))}
        </View>
      ) : null}
      {query.isError ? (
        <View style={styles.error} testID="shared-attachments-error">
          <Text style={styles.errorText}>
            {!connected
              ? t("agentPanel.states.reconnecting")
              : t("message.attachments.sharedLoadFailed", {
                  error: isSharedAttachmentConnectionError(query.error)
                    ? t("common.errors.daemonClientDisconnected")
                    : query.error.message,
                })}
          </Text>
          <Button size="sm" variant="ghost" disabled={query.isFetching || !enabled} onPress={retry}>
            {query.isFetching ? t("message.attachments.sharedLoading") : t("common.actions.retry")}
          </Button>
        </View>
      ) : null}
      <AttachmentLightbox source={lightboxSource} onClose={close} />
    </>
  );
}

function useSharedAttachments(
  props: UserMessageAttachmentProps,
  images: AttachmentMetadata[],
  attachments: AgentAttachment[],
) {
  const active = useRetainedPanelActive();
  const visible = useAppVisible();
  const connected = useHostRuntimeIsConnected(props.serverId ?? "");
  const features = props.client?.getLastServerInfoMessage()?.features;
  const enabled = Boolean(
    active &&
    visible &&
    connected &&
    props.client &&
    !props.isPending &&
    (props.clientMessageId || (props.agentId && props.messageId)) &&
    features?.workspaceFileEditing &&
    features.canonicalSubmittedPrompts,
  );
  const query = useFetchQuery({
    queryKey: [
      "sharedMessageAttachments",
      props.serverId,
      props.agentId,
      props.clientMessageId,
      props.messageId,
    ],
    enabled,
    dataShape: "value",
    staleTimeMs: 30_000,
    retry: (count, error) =>
      Boolean(
        getHostRuntimeStore()
          .getClient(props.serverId ?? "")
          ?.getLastServerInfoMessage(),
      ) && retrySharedAttachmentRead(count, error),
    retryDelay: 1000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      // Reconnection can replace the client before React commits the new props.
      const client = currentAttachmentClient(props.serverId);
      const store = getSharedMessageStore(client);
      let shared = await store.read(props);
      if (!shared && props.clientMessageId && (images.length || attachments.length)) {
        shared = await shareMessageAttachments(client, {
          clientMessageId: props.clientMessageId,
          images,
          attachments,
          encodedImages: await encodeImages(images),
        });
      }
      if (shared && props.agentId && props.messageId && (images.length || attachments.length))
        await store.bind(shared, props.agentId, props.messageId);
      return shared;
    },
  });
  return { query, enabled, connected };
}

function LocalImage({
  image,
  onOpen,
}: {
  image: AttachmentMetadata;
  onOpen: (image: AttachmentMetadata) => void;
}) {
  const { t } = useTranslation();
  const open = useCallback(() => onOpen(image), [image, onOpen]);
  return (
    <AttachmentFrame onPress={open} accessibilityLabel={t("composer.attachments.openImage")}>
      <AttachmentThumbnail metadata={image} />
    </AttachmentFrame>
  );
}

function SharedImage({
  image,
  serverId,
  enabled,
  connected,
  onOpen,
  localImage,
}: {
  image: UploadedFileAttachment;
  serverId: string;
  enabled: boolean;
  connected: boolean;
  onOpen: (image: AttachmentMetadata) => void;
  localImage?: AttachmentMetadata;
}) {
  const { t } = useTranslation();
  const key = `shared:${serverId}:${image.id}:${image.path}:${image.size}`;
  const locate = useCallback(async () => {
    if (localImage) {
      try {
        const url = await resolveAttachmentPreviewUrl(localImage);
        await releaseAttachmentPreviewUrl({ attachment: localImage, url });
        return localImage;
      } catch {
        /* A cleared sender cache can be recovered from the host. */
      }
    }
    const target = resolveFilePreviewReadTarget({ path: image.path });
    if (!target) throw new Error(t("message.attachments.imageUnavailable"));
    const file = await currentAttachmentClient(serverId).readFile(
      target.cwd,
      target.path,
      undefined,
      50 * 1024 * 1024,
    );
    if (file.bytes.length !== image.size) throw new Error(t("message.attachments.imageLoadFailed"));
    return persistAttachmentFromBytes({
      bytes: file.bytes,
      mimeType: image.mimeType,
      fileName: image.fileName,
    });
  }, [serverId, image, localImage, t]);
  const query = useFetchQuery({
    queryKey: ["sharedMessageImage", serverId, key],
    enabled,
    dataShape: "value",
    immutableWhen: () => true,
    gcTime: 0,
    retry: (count, error) =>
      Boolean(getHostRuntimeStore().getClient(serverId)?.getLastServerInfoMessage()) &&
      retrySharedAttachmentRead(count, error),
    retryDelay: 1000,
    queryFn: ({ signal }) => imageCache.acquire(key, () => imageReads.run(locate, signal)),
  });
  const refetch = query.refetch;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  useEffect(() => {
    if (!query.data) return;
    return imageCache.acquireRetained(key, async () => query.data!).release;
  }, [key, query.data]);
  if (query.data) return <LocalImage image={query.data} onOpen={onOpen} />;
  return (
    <View style={styles.imageStatus} testID="shared-image-status">
      {query.isError ? (
        <>
          <Text style={styles.errorText}>
            {t(
              connected ? "message.attachments.imageLoadFailed" : "agentPanel.states.reconnecting",
            )}
          </Text>
          <Button size="sm" variant="ghost" disabled={!enabled || query.isFetching} onPress={retry}>
            {t("common.actions.retry")}
          </Button>
        </>
      ) : (
        <ActivityIndicator accessibilityLabel={t("message.attachments.sharedLoading")} />
      )}
    </View>
  );
}

function MessageAttachment({ attachment }: { attachment: AgentAttachment }) {
  const { t } = useTranslation();
  const content = getAgentAttachmentPillContent(attachment, t);
  const fileLink = useFileLink({
    href: attachment.type === "uploaded_file" ? attachment.path : "",
  });
  return (
    <AttachmentFrame
      onPress={attachment.type === "uploaded_file" ? fileLink.onPress : undefined}
      accessibilityLabel={
        attachment.type === "uploaded_file"
          ? `${t("message.actions.openFile")}: ${attachment.fileName}`
          : undefined
      }
    >
      <AttachmentLabel icon={content.icon} title={content.title} subtitle={content.subtitle} />
    </AttachmentFrame>
  );
}
const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  error: { gap: theme.spacing[1], alignItems: "flex-start", marginBottom: theme.spacing[2] },
  errorText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  imageStatus: { minWidth: 80, minHeight: 60, justifyContent: "center", alignItems: "center" },
}));
