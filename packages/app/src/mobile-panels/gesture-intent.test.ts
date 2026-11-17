import { describe, expect, it } from "vitest";

import { getMobilePanelOpeningPosition, resolveMobilePanelGestureIntent } from "./gesture-intent";

describe("mobile panel gesture intent", () => {
  it("rejects a pending swipe when presentation changes before activation", () => {
    expect(
      resolveMobilePanelGestureIntent({
        enabled: false,
        deltaX: 40,
        deltaY: 2,
        direction: 1,
        openGesturesBlocked: false,
        openEdge: null,
      }),
    ).toBe("fail");
  });

  it("blocks both panel-opening directions while the active surface owns horizontal dragging", () => {
    expect([
      resolveMobilePanelGestureIntent({
        enabled: true,
        deltaX: 40,
        deltaY: 2,
        direction: 1,
        openGesturesBlocked: true,
        openEdge: null,
      }),
      resolveMobilePanelGestureIntent({
        enabled: true,
        deltaX: -40,
        deltaY: 2,
        direction: -1,
        openGesturesBlocked: true,
        openEdge: null,
      }),
    ]).toEqual(["fail", "fail"]);
  });

  it("keeps ordinary horizontal panel gestures available when unblocked", () => {
    expect([
      resolveMobilePanelGestureIntent({
        enabled: true,
        deltaX: 40,
        deltaY: 2,
        direction: 1,
        openGesturesBlocked: false,
        openEdge: null,
      }),
      resolveMobilePanelGestureIntent({
        enabled: true,
        deltaX: -40,
        deltaY: 2,
        direction: -1,
        openGesturesBlocked: false,
        openEdge: null,
      }),
    ]).toEqual(["activate", "activate"]);
  });

  it.each([320, 411, 600])("waits for a quarter of a %i-point screen before opening", (width) => {
    for (const direction of [1, -1] as const) {
      const intent = (distance: number) =>
        resolveMobilePanelGestureIntent({
          deltaX: direction * distance,
          deltaY: 3,
          direction,
          openGesturesBlocked: false,
          activationDistance: width / 4,
          enabled: true,
          openEdge: null,
        });
      expect(intent(width / 4 - 1)).toBe("wait");
      expect(intent(width / 4)).toBe("activate");
    }
  });

  it("leaves vertical and diagonal scrolling to the conversation before activation", () => {
    expect(
      resolveMobilePanelGestureIntent({
        deltaX: 25,
        deltaY: 22,
        direction: 1,
        openGesturesBlocked: false,
        activationDistance: 100,
        enabled: true,
        openEdge: null,
      }),
    ).toBe("fail");
    expect(
      resolveMobilePanelGestureIntent({
        deltaX: -8,
        deltaY: 30,
        direction: -1,
        openGesturesBlocked: false,
        activationDistance: 100,
        enabled: true,
        openEdge: null,
      }),
    ).toBe("fail");
  });

  it("reveals the new panel continuously from the threshold without a quarter-screen jump", () => {
    expect(getMobilePanelOpeningPosition(99, 400)).toBe(0);
    expect(getMobilePanelOpeningPosition(100, 400)).toBe(0);
    expect(getMobilePanelOpeningPosition(101, 400)).toBeCloseTo(-1 / 300);
    expect(getMobilePanelOpeningPosition(-250, 400)).toBe(0.5);
    expect(getMobilePanelOpeningPosition(400, 400)).toBe(-1);
  });

  it("opens phone web drawers only from the edge they slide in from", () => {
    const swipe = { deltaY: 2, openGesturesBlocked: false };
    expect([
      resolveMobilePanelGestureIntent({
        enabled: true,
        ...swipe,
        deltaX: 40,
        direction: 1,
        openEdge: { startX: 200, windowWidth: 400 },
      }),
      resolveMobilePanelGestureIntent({
        enabled: true,
        ...swipe,
        deltaX: 40,
        direction: 1,
        openEdge: { startX: 12, windowWidth: 400 },
      }),
      resolveMobilePanelGestureIntent({
        enabled: true,
        ...swipe,
        deltaX: -40,
        direction: -1,
        openEdge: { startX: 200, windowWidth: 400 },
      }),
      resolveMobilePanelGestureIntent({
        enabled: true,
        ...swipe,
        deltaX: -40,
        direction: -1,
        openEdge: { startX: 388, windowWidth: 400 },
      }),
    ]).toEqual(["fail", "activate", "fail", "activate"]);
  });

  it("opens from anywhere when the layout does not require an edge start", () => {
    expect(
      resolveMobilePanelGestureIntent({
        enabled: true,
        deltaX: 40,
        deltaY: 2,
        direction: 1,
        openGesturesBlocked: false,
        openEdge: null,
      }),
    ).toBe("activate");
  });
});
