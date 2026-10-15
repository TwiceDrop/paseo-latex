export type MobilePanelGestureDirection = -1 | 1;
export type MobilePanelGestureIntent = "activate" | "fail" | "wait";

export const MOBILE_PANEL_OPEN_FRACTION = 0.25;

export function getMobilePanelOpeningPosition(translationX: number, windowWidth: number): number {
  "worklet";
  // Activation consumes the dead zone; projecting the full translation would
  // make the panel jump by a quarter screen on the first active frame.
  const fraction = translationX / windowWidth;
  if (Math.abs(fraction) <= MOBILE_PANEL_OPEN_FRACTION) return 0;
  const progress = Math.min(
    1,
    (Math.abs(fraction) - MOBILE_PANEL_OPEN_FRACTION) / (1 - MOBILE_PANEL_OPEN_FRACTION),
  );
  return -Math.sign(fraction) * progress;
}

export function resolveMobilePanelGestureIntent(input: {
  deltaX: number;
  deltaY: number;
  direction: MobilePanelGestureDirection;
  openGesturesBlocked: boolean;
  activationDistance?: number;
}): MobilePanelGestureIntent {
  "worklet";
  if (input.openGesturesBlocked) {
    return "fail";
  }
  const directedDelta = input.deltaX * input.direction;
  const absDeltaX = Math.abs(input.deltaX);
  const absDeltaY = Math.abs(input.deltaY);
  if (directedDelta <= -10 || (absDeltaY > 10 && absDeltaY * 1.5 >= absDeltaX)) {
    return "fail";
  }
  if (directedDelta >= (input.activationDistance ?? 15) && absDeltaX > absDeltaY * 1.5) {
    return "activate";
  }
  return "wait";
}
