import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { settingsStyles } from "@/styles/settings";
import { createLatexUpdater, type LatexUpdatePort } from "./latex-updater";
import { createNativeLatexUpdatePort } from "./latex-update-port";

export function NativeLatexAppUpdateRow() {
  const [port] = useState(createNativeLatexUpdatePort);
  return port ? <LatexAppUpdateRow port={port} /> : null;
}

export function LatexAppUpdateRow({ port }: { port: LatexUpdatePort }) {
  const { t } = useTranslation();
  const [updater] = useState(() => createLatexUpdater(port));
  const state = useSyncExternalStore(updater.subscribe, updater.getState, updater.getState);
  useEffect(() => () => updater.dispose(), [updater]);
  const busy = ["checking", "downloading", "installing"].includes(state.status);
  const canUpdate = state.release !== null && state.release.versionCode > port.installedVersionCode;
  const check = useCallback(() => {
    void updater.check();
  }, [updater]);
  const update = useCallback(() => {
    void (state.downloaded ? updater.install() : updater.download());
  }, [state.downloaded, updater]);
  const message = t(`latexUpdates.status.${state.status}`, {
    version: state.release?.label ?? "",
    progress: Math.floor(state.progress * 100),
    message: state.error ?? "",
  });

  return (
    <View style={[settingsStyles.row, settingsStyles.rowBorder]} testID="latex-app-update">
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("latexUpdates.title")}</Text>
        <Text style={settingsStyles.rowHint} accessibilityLiveRegion="polite">
          {message}
        </Text>
        <View style={styles.actions}>
          <Button variant="outline" size="sm" disabled={busy} onPress={check}>
            {t("latexUpdates.check")}
          </Button>
          {canUpdate && !busy ? (
            <Button size="sm" onPress={update}>
              {t(state.downloaded ? "latexUpdates.install" : "latexUpdates.download")}
            </Button>
          ) : null}
          {state.status === "checking" || state.status === "downloading" ? (
            <Button variant="outline" size="sm" onPress={updater.cancel}>
              {t("common.actions.cancel")}
            </Button>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
}));
