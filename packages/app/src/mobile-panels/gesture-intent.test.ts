import { describe, expect, it } from "vitest";

import { getMobilePanelOpeningPosition, resolveMobilePanelGestureIntent } from "./gesture-intent";

describe("mobile panel gesture intent", () => {
  it("blocks both panel-opening directions while the active surface owns horizontal dragging", () => {
    expect([
      resolveMobilePanelGestureIntent({
        deltaX: 40,
        deltaY: 2,
        direction: 1,
        openGesturesBlocked: true,
      }),
      resolveMobilePanelGestureIntent({
        deltaX: -40,
        deltaY: 2,
        direction: -1,
        openGesturesBlocked: true,
      }),
    ]).toEqual(["fail", "fail"]);
  });

  it("keeps ordinary horizontal panel gestures available when unblocked", () => {
    expect([
      resolveMobilePanelGestureIntent({
        deltaX: 40,
        deltaY: 2,
        direction: 1,
        openGesturesBlocked: false,
      }),
      resolveMobilePanelGestureIntent({
        deltaX: -40,
        deltaY: 2,
        direction: -1,
        openGesturesBlocked: false,
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
      }),
    ).toBe("fail");
    expect(
      resolveMobilePanelGestureIntent({
        deltaX: -8,
        deltaY: 30,
        direction: -1,
        openGesturesBlocked: false,
        activationDistance: 100,
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
});
