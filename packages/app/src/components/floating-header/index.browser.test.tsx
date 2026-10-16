import React, { act, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Pressable, Text, View } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { FloatingHeaderLayout } from ".";

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const contentStyle = { flex: 1 };
const headerStyle = { height: 80, flexDirection: "row" as const };
const loadingStyle = {
  position: "absolute" as const,
  inset: 0,
  zIndex: 40,
  backgroundColor: "white",
};

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

it("keeps navigation reachable above a pending chat overlay and preserves a later tab selection", async () => {
  let finishLoading!: () => void;
  const loading = new Promise<void>((resolve) => {
    finishLoading = resolve;
  });
  const mounted = vi.fn();
  const unmounted = vi.fn();

  function Content({ tab }: { tab: string }) {
    const [ready, setReady] = useState(false);
    useEffect(() => {
      mounted();
      void loading.then(() => setReady(true));
      return () => unmounted();
    }, []);
    return (
      <View style={contentStyle}>
        <Text>{tab === "files" ? "Files are open" : "Chat is open"}</Text>
        {tab === "chat" && !ready ? (
          // ChatAgentReadyContent uses this layer while catching up with history.
          <View testID="pending-chat-overlay" style={loadingStyle}>
            <Text>Loading messages</Text>
          </View>
        ) : null}
      </View>
    );
  }

  function Screen() {
    const [tab, setTab] = useState("chat");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const openSidebar = useCallback(() => setSidebarOpen(true), []);
    const switchTab = useCallback(() => setTab("files"), []);
    const header = useMemo(
      () => (
        <View style={headerStyle}>
          <Pressable accessibilityRole="button" onPress={openSidebar}>
            <Text>Open sidebar</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={switchTab}>
            <Text>Switch tab</Text>
          </Pressable>
          {sidebarOpen ? <Text>Sidebar is open</Text> : null}
        </View>
      ),
      [openSidebar, sidebarOpen, switchTab],
    );
    return (
      <FloatingHeaderLayout floating={tab === "chat"} header={header}>
        {() => <Content tab={tab} />}
      </FloatingHeaderLayout>
    );
  }

  host = document.createElement("div");
  Object.assign(host.style, { width: "390px", height: "720px", display: "flex" });
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<Screen />));

  const button = host.querySelector<HTMLElement>('[role="button"]')!;
  const bounds = button.getBoundingClientRect();
  expect(
    button.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + 10)),
  ).toBe(true);
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await expect.element(page.getByText("Sidebar is open")).toBeVisible();
  await expect.element(page.getByText("Loading messages")).toBeVisible();

  await page.getByRole("button", { name: "Switch tab" }).click();
  await expect.element(page.getByText("Files are open")).toBeVisible();
  await act(async () => finishLoading());
  await expect.element(page.getByText("Files are open")).toBeVisible();
  expect(host.querySelector('[data-testid="pending-chat-overlay"]')).toBe(null);
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(unmounted).toHaveBeenCalledTimes(0);
});
