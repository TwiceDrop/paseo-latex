import { useCallback, useRef } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { getDesktopHost, isElectronRuntime } from "@/desktop/host";
import {
  normalizePickedImageAssets,
  pickImagesWithDesktopDialog,
  type PickedImageAttachmentInput,
} from "@/hooks/image-attachment-picker";
import { isWeb } from "@/constants/platform";

export type ImageAttachmentSource = "camera" | "library";

interface UseImageAttachmentPickerResult {
  pickImages: (source: ImageAttachmentSource) => Promise<PickedImageAttachmentInput[] | null>;
}

export function useImageAttachmentPicker(): UseImageAttachmentPickerResult {
  const { t } = useTranslation();
  const [mediaPermission, requestMediaPermission] = ImagePicker.useMediaLibraryPermissions();
  const isPickingRef = useRef(false);

  const ensurePermission = useCallback(async () => {
    let currentPermission = mediaPermission;

    if (
      !currentPermission ||
      currentPermission.status === ImagePicker.PermissionStatus.UNDETERMINED
    ) {
      currentPermission = await requestMediaPermission();
    } else if (!currentPermission.granted) {
      currentPermission = await requestMediaPermission();
    }

    if (!currentPermission?.granted) {
      Alert.alert(
        t("imageAttachmentPicker.permissionTitle"),
        t("imageAttachmentPicker.permissionMessage"),
      );
      return false;
    }

    return true;
  }, [mediaPermission, requestMediaPermission, t]);

  const pickImages = useCallback(
    async (source: ImageAttachmentSource) => {
      if (isPickingRef.current) {
        return null;
      }

      isPickingRef.current = true;

      try {
        if (source === "camera") {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            Alert.alert(
              t("imageAttachmentPicker.permissionTitle"),
              t("imageAttachmentPicker.cameraPermissionMessage"),
            );
            return null;
          }

          const photo = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.8,
          });
          return photo.canceled ? null : await normalizePickedImageAssets(photo.assets);
        }

        if (isWeb && isElectronRuntime()) {
          const selectedImages = await pickImagesWithDesktopDialog(getDesktopHost()?.dialog);
          if (selectedImages.length === 0) {
            return null;
          }
          return selectedImages;
        }

        const hasPermission = await ensurePermission();
        if (!hasPermission) {
          return null;
        }

        const pendingResult = await ImagePicker.getPendingResultAsync();
        if (pendingResult && "canceled" in pendingResult && !pendingResult.canceled) {
          return await normalizePickedImageAssets(pendingResult.assets);
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"] as ImagePicker.MediaType[],
          allowsMultipleSelection: true,
          quality: 0.8,
        });

        if (result.canceled) {
          return null;
        }

        return await normalizePickedImageAssets(result.assets);
      } catch (error) {
        console.error("[ImageAttachmentPicker] Failed to pick image:", error);
        Alert.alert(
          t("imageAttachmentPicker.errorTitle"),
          t(
            source === "camera"
              ? "imageAttachmentPicker.failedToAttachPhoto"
              : "imageAttachmentPicker.failedToSelect",
          ),
        );
        return null;
      } finally {
        isPickingRef.current = false;
      }
    },
    [ensurePermission, t],
  );

  return { pickImages };
}
