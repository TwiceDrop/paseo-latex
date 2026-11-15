import { useCallback, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { useFetchQuery } from "@/data/query";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useAppActivelyVisible } from "@/hooks/use-app-visible";
import { HighlightedCodeBlock } from "@/components/highlighted-code-block";
import { Button } from "@/components/ui/button";
import { loadBundledHtml } from "@/utils/load-bundled-html";
import type { MarkdownFenceRendererProps } from "./types";

const loadRuntime = () => loadBundledHtml(require("./runtime/mermaid.gen.html"));

/** One read per set of mounted diagrams; no multi-megabyte HTML in startup JS/Hermes. */
export function MermaidRuntimeResource({
  children,
  ...props
}: MarkdownFenceRendererProps & { children: (html: string) => ReactNode }) {
  const { t } = useTranslation();
  const active = useRetainedPanelActive();
  const visible = useAppActivelyVisible();
  const runtime = useFetchQuery({
    queryKey: ["mermaid-runtime"],
    queryFn: loadRuntime,
    enabled: active && visible,
    dataShape: "value",
    immutableWhen: () => true,
    retry: false,
    // Release the HTML when the final diagram (including fullscreen) closes.
    gcTime: 0,
  });
  const { refetch } = runtime;
  const retry = useCallback(() => void refetch(), [refetch]);
  if (runtime.data) return children(runtime.data);
  return (
    <View>
      <HighlightedCodeBlock {...props} language="mermaid" />
      {runtime.error ? (
        <View style={styles.error} testID="mermaid-resource-error">
          <Text style={styles.message}>{t("panels.file.failedToLoadPreview")}</Text>
          <Button variant="outline" size="sm" loading={runtime.isFetching} onPress={retry}>
            {t("common.actions.retry")}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  error: { padding: theme.spacing[2], gap: theme.spacing[2], alignItems: "flex-start" },
  message: { color: theme.colors.destructive, fontSize: theme.fontSize.sm },
}));
