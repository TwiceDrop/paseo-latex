import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { MarkdownTextSpan } from "@/components/markdown-text";
import { useStableEvent } from "@/hooks/use-stable-event";
import { openExternalUrl } from "@/utils/open-external-url";
import {
  createMathDocument,
  parseMathDimensions,
  type MathDimensions,
  type MathDocumentOptions,
} from "./document";

interface MathSurfaceProps extends MathDocumentOptions {
  source: string;
  onLinkPress?: (href: string) => boolean;
}

const ORIGINS = ["*"];
const styles = StyleSheet.create({ webView: { backgroundColor: "transparent", flex: 1 } });

export const MathSurface = memo(function MathSurface({
  source,
  onLinkPress,
  ...options
}: MathSurfaceProps) {
  const webView = useRef<WebView>(null);
  const [webSource] = useState(() => ({ html: createMathDocument(options) }));
  const [ready, setReady] = useState(false);
  const [dimensions, setDimensions] = useState<MathDimensions | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const { id, fontSize, color, html, wrap, lineHeight, fontWeight, linkColor } = options;
  const update = useStableEvent(() => {
    webView.current?.injectJavaScript(
      `window.__PASEO_MATH_UPDATE__(${JSON.stringify({ id, fontSize, color, html, wrap, lineHeight, fontWeight, linkColor })});true;`,
    );
  });
  useEffect(() => {
    if (ready) update();
  }, [ready, update, id, fontSize, color, html, wrap, lineHeight, fontWeight, linkColor]);
  const onLoadEnd = useCallback(() => {
    setReady(true);
    update();
  }, [update]);
  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let value: unknown;
      try {
        value = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      const measured = parseMathDimensions(value);
      if (measured?.id === id) {
        setDimensions((previous) =>
          previous?.id === id &&
          previous.width === measured.width &&
          previous.height === measured.height
            ? previous
            : measured,
        );
      } else if (
        typeof value === "object" &&
        value !== null &&
        "id" in value &&
        value.id === id &&
        "type" in value &&
        value.type === "link" &&
        "href" in value &&
        typeof value.href === "string"
      ) {
        if (onLinkPress?.(value.href) !== false) void openExternalUrl(value.href);
      }
    },
    [id, onLinkPress],
  );
  const onError = useCallback(() => {
    setFailedId(id);
    setReady(false);
  }, [id]);
  const allowLoad = useCallback((request: { url: string }) => request.url === "about:blank", []);
  const height = dimensions?.height ?? Math.ceil(fontSize * 2);
  const frameStyle = useMemo(
    () => ({ width: "100%" as const, height, maxWidth: "100%" as const }),
    [height],
  );
  const fallbackStyle = useMemo(() => ({ color, fontSize }), [color, fontSize]);
  if (failedId === id) return <MarkdownTextSpan style={fallbackStyle}>{source}</MarkdownTextSpan>;
  return (
    <View style={frameStyle} accessibilityLabel={source}>
      <WebView
        ref={webView}
        source={webSource}
        originWhitelist={ORIGINS}
        style={styles.webView}
        onMessage={onMessage}
        onLoadEnd={onLoadEnd}
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
