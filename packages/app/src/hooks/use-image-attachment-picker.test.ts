// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useImageAttachmentPicker } from "./use-image-attachment-picker";

const picker = vi.hoisted(() => ({
  requestCameraPermissionsAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  requestLibrary: vi.fn(),
  alert: vi.fn(),
}));

vi.mock("expo-image-picker", () => ({
  ...picker,
  useMediaLibraryPermissions: () => [null, picker.requestLibrary],
}));
vi.mock("@/hooks/image-attachment-picker", () => import("./image-attachment-picker.native"));
vi.mock("expo-image-manipulator", () => ({}));
vi.mock("react-native", () => ({ Alert: { alert: picker.alert } }));
vi.mock("@/constants/platform", () => ({ isWeb: false }));
vi.mock("@/desktop/host", () => ({ isElectronRuntime: () => false }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("camera attachments", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
  });

  it("returns a captured JPEG for the attachment store without requesting library access", async () => {
    const uri = "file:///cache/capture.jpg";
    picker.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri, mimeType: "image/jpeg" }],
    });
    const { result } = renderHook(useImageAttachmentPicker);
    expect(await result.current.pickImages("camera")).toMatchObject([
      { source: { kind: "file_uri", uri }, mimeType: "image/jpeg" },
    ]);
    expect(picker.launchCameraAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ["images"] }),
    );
    expect(picker.requestLibrary).not.toHaveBeenCalled();
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it("leaves the draft alone on denial or cancellation, and lets the user retry", async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false });
    picker.launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });
    const { result } = renderHook(useImageAttachmentPicker);
    expect(await result.current.pickImages("camera")).toBeNull();
    expect(picker.launchCameraAsync).not.toHaveBeenCalled();
    expect(picker.alert).toHaveBeenCalledOnce();
    const pending = result.current.pickImages("camera");
    expect(await result.current.pickImages("library")).toBeNull();
    expect(await pending).toBeNull();
    expect(picker.launchCameraAsync).toHaveBeenCalledOnce();
    expect(picker.alert).toHaveBeenCalledOnce();
  });
});
