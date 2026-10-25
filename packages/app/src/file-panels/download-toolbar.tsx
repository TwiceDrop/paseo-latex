import { useCallback } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { PaneContentToolbar } from "@/components/ui/pane-content-toolbar";
import { getFileNameFromPath } from "@/attachments/utils";
import { useFileDownload } from "@/hooks/use-file-download";
import { useDownloadStore } from "@/stores/download-store";
import { formatFileSize } from "@/utils/format-file-size";

/** Shared by all file panels, including plugin panels and unsupported binary files. */
export function FileDownloadToolbar({
  serverId,
  target,
  size,
}: {
  serverId: string;
  target: { cwd: string; path: string };
  size?: number;
}) {
  const { t } = useTranslation();
  const download = useFileDownload({ serverId, workspaceRoot: target.cwd });
  const downloading = useDownloadStore((state) =>
    [...state.downloads.values()].some(
      (file) =>
        file.serverId === serverId &&
        file.scopeId === target.cwd &&
        file.path === target.path &&
        (file.status === "downloading" || file.status === "saving"),
    ),
  );
  const onDownload = useCallback(() => {
    download({ path: target.path, fileName: getFileNameFromPath(target.path) ?? target.path });
  }, [download, target.path]);
  return (
    <PaneContentToolbar testID="file-download-toolbar">
      <View style={styles.row}>
        {size === undefined ? null : <Text style={styles.size}>{formatFileSize(size)}</Text>}
        <Button
          variant="ghost"
          size="xs"
          leftIcon={Download}
          onPress={onDownload}
          disabled={downloading}
          loading={downloading}
          testID="file-panel-download"
        >
          {t("workspace.fileActions.download")}
        </Button>
      </View>
    </PaneContentToolbar>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
  },
  size: { flex: 1, color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
}));
