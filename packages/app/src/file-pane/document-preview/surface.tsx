import { useMemo } from "react";
import { WebView } from "react-native-webview";
import { StyleSheet } from "react-native-unistyles";
import { View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useMobilePanelContentGesture } from "@/mobile-panels/gestures";

const origins = ["*"];
const allowInitialDocument = ({ url }: { url: string }) => url === "about:blank";

export function DocumentSurface({ html }: { html: string }) {
  const source = useMemo(() => ({ html, baseUrl: "about:blank" }), [html]);
  const gesture = useMobilePanelContentGesture();
  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.surface} collapsable={false}>
        <WebView
          source={source}
          testID="document-preview"
          style={styles.surface}
          originWhitelist={origins}
          onShouldStartLoadWithRequest={allowInitialDocument}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          domStorageEnabled={false}
          thirdPartyCookiesEnabled={false}
          cacheEnabled={false}
          allowFileAccess={false}
          allowUniversalAccessFromFileURLs={false}
          incognito
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create(() => ({ surface: { flex: 1, backgroundColor: "white" } }));
