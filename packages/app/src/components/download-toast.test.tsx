import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useDownloadStore } from "@/stores/download-store";
import { DownloadToast } from "./download-toast";

// The platform adapter opens Android's document picker. Its outcomes are controlled here;
// the download state and visible progress/error handling are the production implementations.
const { nativeDownload, theme, translate } = vi.hoisted(() => ({
  nativeDownload: vi.fn(),
  translate: (key: string) =>
    ({
      "common.states.starting": "Starting",
      "common.states.downloadComplete": "Download complete",
      "downloads.saving": "Choose a save location",
      "downloads.cancelled": "Download cancelled",
      "common.actions.close": "Close",
      "downloads.failed": "Download failed",
    })[key] ?? key,
  theme: {
    spacing: { 1: 4, 3: 12, 4: 16 },
    borderRadius: { full: 999, lg: 8 },
    borderWidth: { 1: 1 },
    fontSize: { base: 15, sm: 13 },
    fontWeight: { semibold: "600" },
    shadow: { md: {} },
    colors: {
      foreground: "#fff",
      foregroundMuted: "#aaa",
      surface2: "#222",
      border: "#444",
      primary: "green",
      destructive: "red",
    },
  },
}));
vi.mock("@/downloads/native-download", () => ({ downloadNativeFile: nativeDownload }));
vi.mock("@/constants/platform", () => ({ isWeb: false }));
vi.mock("@/i18n/i18next", () => ({ i18n: { t: translate } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: (factory: (theme: unknown) => unknown) => factory(theme) },
  useUnistyles: () => ({ theme }),
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("@/components/ui/loading-spinner", () => ({ LoadingSpinner: () => <span>Working</span> }));
vi.mock("lucide-react-native", () => ({
  Check: () => <span />,
  X: () => <span />,
  XCircle: () => <span />,
}));

let root: Root;
let container: HTMLElement;
let dom: JSDOM;
const requestToken = vi.fn();
const input = {
  serverId: "server",
  scopeId: "/workspace",
  cwd: "/workspace",
  path: "report.pdf",
  fileName: "report.pdf",
  daemonProfile: undefined,
  client: {} as DaemonClient,
  requestFileDownloadToken: requestToken,
};
beforeEach(() => {
  dom = new JSDOM("<html><body><div id='root'></div></body></html>", { url: "http://localhost" });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.getElementById("root")!;
  root = createRoot(container);
  useDownloadStore.setState({ downloads: new Map(), activeDownloadId: null });
  nativeDownload.mockReset();
  requestToken.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  dom.window.close();
  vi.unstubAllGlobals();
});

it("waits for the selected destination before showing download complete, and prevents duplicate downloads", async () => {
  let finish!: (uri: string) => void;
  nativeDownload.mockImplementation(async (options) => {
    options.onProgress(128, 256);
    options.onSaving();
    return new Promise<string>((resolve) => {
      finish = resolve;
    });
  });
  let operation!: Promise<void>;
  await act(async () => {
    root.render(<DownloadToast />);
    operation = useDownloadStore.getState().startDownload(input);
  });
  expect(container.textContent).toContain("report.pdf");
  expect(container.textContent).toContain("Choose a save location");
  expect(container.textContent).not.toContain("Download complete");
  await act(async () => useDownloadStore.getState().startDownload(input));
  expect(nativeDownload).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish("content://saved/report.pdf");
    await operation;
  });
  expect(container.textContent).toContain("Download complete");
  expect(requestToken).not.toHaveBeenCalled();
});

it("keeps a failed download visible until the user dismisses it", async () => {
  vi.useFakeTimers();
  nativeDownload.mockRejectedValue(new Error("Disk full"));
  await act(async () => {
    root.render(<DownloadToast />);
    await useDownloadStore.getState().startDownload(input);
  });
  expect(container.textContent).toContain("Disk full");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(container.textContent).toContain("Disk full");
  const close = container.querySelector<HTMLElement>('[aria-label="Close"]')!;
  await act(async () => close.click());
  expect(container.textContent).toBe("");
});

it("reports cancellation without claiming that the file was saved", async () => {
  nativeDownload.mockResolvedValue(null);
  await act(async () => {
    root.render(<DownloadToast />);
    await useDownloadStore.getState().startDownload(input);
  });
  expect(container.textContent).toContain("Download cancelled");
  expect(container.textContent).not.toContain("Download complete");
});
