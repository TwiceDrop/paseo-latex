import { memo, useCallback, useMemo, useState } from "react";
import { View, useWindowDimensions, StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { MarkdownTextSpan } from "@/components/markdown-text";
import { createMathDocument, parseMathDimensions, type MathDimensions } from "./document";
import { renderMath } from "./render";
import type { MarkdownMathProps } from "./types";

const ORIGINS = ["*"];
const styles = StyleSheet.create({
  webView: { backgroundColor: "transparent", flex: 1 },
});

export const MarkdownMath = memo(function MarkdownMath({
  content,
  source,
  displayMode,
  inheritedStyles,
}: MarkdownMathProps) {
  const window = useWindowDimensions();
  const fontSize = (inheritedStyles.fontSize ?? 16) * window.fontScale;
  const color = typeof inheritedStyles.color === "string" ? inheritedStyles.color : "#888888";
  const id = JSON.stringify({ source, displayMode, fontSize, color });
  const html = useMemo(() => renderMath(content, displayMode), [content, displayMode]);
  const webSource = useMemo(() => {
    if (html === null) return null;
    return { html: createMathDocument({ html, id, fontSize, color }) };
  }, [html, id, fontSize, color]);
  const [dimensions, setDimensions] = useState<MathDimensions | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let value: unknown;
      try {
        value = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      const measured = parseMathDimensions(value);
      if (measured?.id === id) setDimensions(measured);
    },
    [id],
  );
  const onError = useCallback(() => setFailedId(id), [id]);
  const allowLoad = useCallback((request: { url: string }) => request.url === "about:blank", []);

  const current = dimensions?.id === id ? dimensions : null;
  const height = current?.height ?? Math.ceil(fontSize * 2);
  const maxWidth = Math.max(1, window.width - 32);
  const width = Math.min(current?.width ?? maxWidth, maxWidth);
  const frameStyle = useMemo(() => ({ width, height, maxWidth: "100%" as const }), [width, height]);
  if (webSource === null || failedId === id) {
    return <MarkdownTextSpan style={inheritedStyles}>{source}</MarkdownTextSpan>;
  }
  return (
    <View style={frameStyle} accessibilityLabel={source}>
      <WebView
        source={webSource}
        originWhitelist={ORIGINS}
        style={styles.webView}
        onMessage={onMessage}
        onError={onError}
        onShouldStartLoadWithRequest={allowLoad}
        scrollEnabled
        nestedScrollEnabled
        scalesPageToFit={false}
        setSupportMultipleWindows={false}
        javaScriptEnabled
        textZoom={100}
      />
    </View>
  );
});
