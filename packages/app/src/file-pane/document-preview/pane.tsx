import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { useFetchQuery } from "@/data/query";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useAppActivelyVisible } from "@/hooks/use-app-visible";
import { useFileDownload } from "@/hooks/use-file-download";
import { useSessionStore } from "@/stores/session-store";
import { useDownloadStore } from "@/stores/download-store";
import { resolveFilePreviewReadTarget } from "@/file-explorer/preview-target";
import { getFileNameFromPath } from "@/attachments/utils";
import { FilePanelBar } from "../bar";
import { documentPreviewHtml } from "./html";
import { readPreviewDocument, type DocumentKind } from "./model";
import { DocumentSurface } from "./surface";

const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const spinnerColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function DocumentPane({
  serverId,
  workspaceRoot,
  path,
  kind,
}: {
  serverId: string;
  workspaceRoot: string;
  path: string;
  kind: DocumentKind;
}) {
  const { t } = useTranslation();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const generation = useSessionStore((state) => state.sessions[serverId]?.clientGeneration ?? 0);
  const active = useRetainedPanelActive();
  const visible = useAppActivelyVisible();
  const target = useMemo(
    () => resolveFilePreviewReadTarget({ path, workspaceRoot }),
    [path, workspaceRoot],
  );
  const query = useFetchQuery({
    queryKey: ["document-preview", serverId, generation, target?.cwd, target?.path],
    queryFn: () => {
      if (!client) throw new Error(t("workspace.terminal.hostDisconnected"));
      if (!target) throw new Error(t("panels.file.directoryMissing"));
      return readPreviewDocument({ reader: client, cwd: target.cwd, path: target.path });
    },
    enabled: !!client && !!target && active && visible,
    dataShape: "value",
    // Switching retained workspaces should not repeatedly transfer and base64-encode
    // the same document. Reopening the pane still revalidates through useFetchQuery.
    staleTimeMs: 30_000,
    retry: false,
    gcTime: 0,
  });
  const download = useFileDownload({ serverId, workspaceRoot: target?.cwd ?? "" });
  const downloading = useDownloadStore((state) =>
    [...state.downloads.values()].some(
      (file) =>
        file.serverId === serverId &&
        file.scopeId === target?.cwd &&
        file.path === target?.path &&
        (file.status === "downloading" || file.status === "saving"),
    ),
  );
  const onDownload = useCallback(() => {
    if (target) download({ path: target.path, fileName: getFileNameFromPath(path) ?? path });
  }, [download, path, target]);
  const retry = useCallback(() => {
    void query.refetch();
  }, [query]);
  const html = useMemo(
    () =>
      query.data
        ? documentPreviewHtml({
            bytes: query.data,
            kind,
            labels: {
              loading: t("panels.file.loading"),
              failed: t("panels.file.failedToLoadPreview"),
              retry: t("common.actions.retry"),
              previous: t("panels.file.document.previous"),
              next: t("panels.file.document.next"),
              zoomIn: t("panels.file.document.zoomIn"),
              zoomOut: t("panels.file.document.zoomOut"),
              fit: t("panels.file.document.fit"),
              sheet: t("panels.file.document.sheet"),
              limitedColumns: t("panels.file.document.limitedColumns"),
              legacy: t("panels.file.document.legacy"),
            },
          })
        : null,
    [kind, query.data, t],
  );
  let message: string | null = null;
  if (!client) message = t("workspace.terminal.hostDisconnected");
  else if (!target) message = t("panels.file.directoryMissing");
  else if (query.error)
    message =
      query.error.message === "File is too large to display"
        ? t("panels.file.document.tooLarge")
        : query.error.message;
  let content;
  if (message)
    content = (
      <View style={styles.center} testID="document-preview-error">
        <Text style={styles.error}>{message}</Text>
        <Button variant="outline" size="sm" onPress={retry} loading={query.isFetching}>
          {t("common.actions.retry")}
        </Button>
      </View>
    );
  else if (html) content = <DocumentSurface html={html} />;
  else
    content = (
      <View style={styles.center} testID="document-preview-loading">
        <ThemedLoadingSpinner size="small" uniProps={spinnerColor} />
        <Text style={styles.message}>{t("panels.file.loading")}</Text>
      </View>
    );
  return (
    <View style={styles.container} testID="workspace-file-pane">
      <FilePanelBar
        size={query.data?.byteLength}
        onDownload={onDownload}
        downloading={downloading}
      />
      {content}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, minHeight: 0, backgroundColor: theme.colors.surface0 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  message: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.base },
  error: { color: theme.colors.destructive, fontSize: theme.fontSize.base, textAlign: "center" },
}));
