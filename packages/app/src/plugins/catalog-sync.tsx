import { useVoiceAudioEngineOptional } from "@/contexts/voice-context";
import { useEffect, useMemo } from "react";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { isLatexBuild } from "@/updates/latex-distribution";
import { pluginRegistry } from "./registry";
import { syncPluginCatalog } from "./catalog-sync-model";
import { useDevicePluginBlocks, useSyncDevicePluginWindows } from "./device-blocks";
import { createDeviceCatalog } from "./device-catalog";

export function PluginCatalogSync({
  serverId,
  client,
}: {
  serverId: string;
  client: DaemonClient;
}) {
  const audio = useVoiceAudioEngineOptional();
  const connected = useHostRuntimeIsConnected(serverId);
  const supported = useHostFeature(serverId, "plugins");
  const device = useMemo(
    () => (isLatexBuild ? createDeviceCatalog(serverId, pluginRegistry) : undefined),
    [serverId],
  );
  useSyncDevicePluginWindows(serverId);
  const { data: blocked, isError } = useDevicePluginBlocks(serverId);
  const registry = device?.registry ?? pluginRegistry;
  const ready = !device || blocked !== undefined;
  useEffect(() => {
    if (blocked) device?.setBlocked(blocked);
  }, [blocked, device]);
  useEffect(() => {
    if (!ready && supported && audio) {
      registry.setCatalogStatus(serverId, isError ? "error" : "loading");
      return;
    }
    return syncPluginCatalog({ serverId, client, audio, connected, supported, registry });
  }, [audio, client, connected, serverId, supported, registry, ready, isError]);
  useEffect(() => () => registry.removeHost(serverId), [registry, serverId]);
  return null;
}
