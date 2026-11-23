import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard, SettingsRow, SettingsSection, SettingsSwitch } from "@/components/settings";
import { Button } from "@/components/ui/button";
import { useDevicePluginBlocks, useSetDevicePluginBlock } from "../device-blocks";

export function DeviceBlockSection({ serverId, pluginId }: { serverId: string; pluginId: string }) {
  const { t } = useTranslation();
  const blocks = useDevicePluginBlocks(serverId);
  const save = useSetDevicePluginBlock(serverId, pluginId);
  const { refetch } = blocks;
  const retry = useCallback(() => void refetch(), [refetch]);
  const label = t("settings.plugins.gallery.device.block");
  const hint = t("settings.plugins.gallery.device.hint");
  return (
    <SettingsSection title={t("settings.about.thisDevice")}>
      <SettingsCard>
        {blocks.isError ? (
          <SettingsRow label={label} error={blocks.error.message}>
            <Button variant="outline" onPress={retry}>
              {t("common.retry")}
            </Button>
          </SettingsRow>
        ) : (
          <SettingsSwitch
            label={label}
            hint={hint}
            value={blocks.data?.includes(pluginId) ?? false}
            disabled={!blocks.data || save.isPending}
            onValueChange={save.mutate}
            error={save.error?.message}
          />
        )}
      </SettingsCard>
    </SettingsSection>
  );
}
