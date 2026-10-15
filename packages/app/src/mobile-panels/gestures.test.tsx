import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useOpenAgentListGesture, useOpenFileExplorerGesture } from "./gestures";

interface PanEvent {
  absoluteX: number;
  translationX: number;
  velocityX: number;
}
interface TouchEvent {
  changedTouches: { absoluteX: number; absoluteY: number }[];
  numberOfTouches: number;
}
interface Manager {
  activate(): void;
  fail(): void;
}

// Native Pan resets translationX on activation. Exercise that event contract
// through the real hooks; the platform gesture builder and UI-thread bridge are simulated.
const { pans, runtime, makePan } = vi.hoisted(() => {
  class Pan {
    ref: unknown;
    down!: (event: TouchEvent) => void;
    move!: (event: TouchEvent, manager: Manager) => void;
    start!: () => void;
    update!: (event: PanEvent) => void;
    end!: (event: PanEvent, success: boolean) => void;
    withRef(ref: unknown) {
      this.ref = ref;
      return this;
    }
    enabled() {
      return this;
    }
    manualActivation() {
      return this;
    }
    simultaneousWithExternalGesture() {
      return this;
    }
    onTouchesDown(callback: Pan["down"]) {
      this.down = callback;
      return this;
    }
    onTouchesMove(callback: Pan["move"]) {
      this.move = callback;
      return this;
    }
    onStart(callback: Pan["start"]) {
      this.start = callback;
      return this;
    }
    onUpdate(callback: Pan["update"]) {
      this.update = callback;
      return this;
    }
    onEnd(callback: Pan["end"]) {
      this.end = callback;
      return this;
    }
  }
  const registeredPans: Pan[] = [];
  const fakeRuntime = {
    windowWidth: 400,
    position: { value: 0 },
    openGesturesBlocked: { value: false },
    motionState: {
      value: {
        target: "agent",
        motionTarget: "agent",
        settledTarget: "agent",
        revision: 0,
        gesture: null as { startedRevision: number } | null,
      },
    },
    leftOpenGestureRef: {},
    rightOpenGestureRef: {},
    beginGesture: vi.fn(),
    updateGesture: vi.fn(),
    finishGesture: vi.fn(() => null),
  };
  return {
    pans: registeredPans,
    runtime: fakeRuntime,
    makePan: () => {
      const pan = new Pan();
      registeredPans.push(pan);
      return pan;
    },
  };
});
vi.mock("react-native-gesture-handler", () => ({ Gesture: { Pan: makePan } }));
vi.mock("react-native-reanimated", () => ({ useSharedValue: (value: number) => ({ value }) }));
vi.mock("react-native-worklets", () => ({ scheduleOnRN: vi.fn() }));
vi.mock("@/constants/platform", () => ({ isWeb: false }));
vi.mock("@/contexts/horizontal-scroll-context", () => ({
  useHorizontalScrollOptional: () => null,
}));
vi.mock("./provider", () => ({ useMobilePanelsRuntime: () => runtime }));
vi.mock("@/stores/panel-store", () => ({
  usePanelStore: (select: (state: { showMobileAgentList(): void }) => unknown) =>
    select({ showMobileAgentList: vi.fn() }),
}));

let dom: JSDOM;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.clearAllMocks();
  pans.length = 0;
  runtime.motionState.value.gesture = null;
  runtime.beginGesture.mockImplementation(() => {
    runtime.motionState.value.gesture = { startedRevision: 0 };
    return 0;
  });
  dom = new JSDOM("<div id='root'></div>");
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.getElementById("root")!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
});

it.each([1, -1] as const)(
  "reveals direction %i after a quarter screen even when native translation resets",
  async (direction) => {
    function Probe() {
      useOpenAgentListGesture(true);
      useOpenFileExplorerGesture({ enabled: true, onOpen: vi.fn() });
      return null;
    }
    await act(async () => root.render(<Probe />));
    const pan = pans.find(
      (value) =>
        value.ref === (direction === 1 ? runtime.leftOpenGestureRef : runtime.rightOpenGestureRef),
    )!;
    const touch = (distance: number): TouchEvent => ({
      changedTouches: [{ absoluteX: 200 + direction * distance, absoluteY: 400 }],
      numberOfTouches: 1,
    });
    const manager = { activate: vi.fn(() => pan.start()), fail: vi.fn() };
    pan.down(touch(0));
    pan.move(touch(99), manager);
    expect(manager.activate).not.toHaveBeenCalled();
    pan.move(touch(100), manager);
    expect(manager.activate).toHaveBeenCalledTimes(1);
    pan.update({ absoluteX: 200 + direction * 140, translationX: direction * 40, velocityX: 0 });
    expect(runtime.updateGesture).toHaveBeenLastCalledWith(
      0,
      expect.closeTo(-direction * (40 / 300), 8),
    );
    pan.end({ absoluteX: 200 + direction * 150, translationX: direction * 50, velocityX: 0 }, true);
    expect(runtime.finishGesture).toHaveBeenCalledWith({
      startedRevision: 0,
      target: direction === 1 ? "agent-list" : "file-explorer",
      success: true,
    });
  },
);
