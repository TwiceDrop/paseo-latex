/** Own the native drag/momentum lifecycle separately from programmatic scrolling. */
export function createNativeScrollGesture(input: {
  platform: string;
  begin: () => void;
  end: (isAtEnd: boolean) => void;
  requestFrame: (callback: () => void) => unknown;
  cancelFrame: (handle: unknown) => void;
}) {
  let active = false;
  let ownsMomentum = false;
  let endFrame: unknown = null;
  const clearEnd = () => {
    if (endFrame !== null) input.cancelFrame(endFrame);
    endFrame = null;
  };
  return {
    isActive: () => active,
    beginDrag() {
      clearEnd();
      active = true;
      ownsMomentum = true;
      input.begin();
    },
    endDrag(isAtEnd: boolean, velocityY?: number) {
      clearEnd();
      if (!active) return;
      // Android emits a momentum lifecycle even for a zero-velocity release.
      // A JS frame is not evidence that native momentum has finished.
      if (input.platform === "android" || (velocityY !== undefined && velocityY !== 0)) return;
      endFrame = input.requestFrame(() => {
        endFrame = null;
        active = false;
        ownsMomentum = false;
        input.end(isAtEnd);
      });
    },
    beginMomentum() {
      if (!ownsMomentum) return;
      clearEnd();
      if (!active) {
        active = true;
        input.begin();
      }
    },
    endMomentum(isAtEnd: boolean) {
      if (!ownsMomentum) return;
      clearEnd();
      active = false;
      ownsMomentum = false;
      input.end(isAtEnd);
    },
    reset() {
      clearEnd();
      active = false;
      ownsMomentum = false;
    },
  };
}
