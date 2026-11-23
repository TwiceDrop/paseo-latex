import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Platform } from "react-native";
import { useFetchQuery } from "@/data/query";
import { isLatexBuild } from "@/updates/latex-distribution";

const queryKey = (serverId: string) => ["latex-device-blocked-plugins", serverId] as const;
const storagePrefix = (serverId: string) =>
  `@paseo-latex:blocked-plugin:${encodeURIComponent(serverId)}/`;

export function useDevicePluginBlocks(serverId: string) {
  const prefix = storagePrefix(serverId);
  return useFetchQuery({
    queryKey: queryKey(serverId),
    queryFn: async () =>
      (await AsyncStorage.getAllKeys())
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length)),
    enabled: isLatexBuild,
    networkMode: "always",
    dataShape: "value",
    immutableWhen: () => true,
  });
}

/** Electron windows share storage, but each has its own query cache. */
export function useSyncDevicePluginWindows(serverId: string) {
  const client = useQueryClient();
  useEffect(() => {
    if (!isLatexBuild || Platform.OS !== "web" || typeof window === "undefined") return;
    const prefix = storagePrefix(serverId);
    function changed(event: StorageEvent) {
      if (
        event.storageArea === window.localStorage &&
        (event.key === null || event.key.startsWith(prefix))
      ) {
        void client.invalidateQueries({ queryKey: queryKey(serverId) });
      }
    }
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [client, serverId]);
}

export function useSetDevicePluginBlock(serverId: string, pluginId: string) {
  const client = useQueryClient();
  return useMutation({
    networkMode: "always",
    scope: { id: storagePrefix(serverId) + pluginId },
    mutationFn: async (blocked: boolean) => {
      const key = storagePrefix(serverId) + pluginId;
      if (blocked) await AsyncStorage.setItem(key, "1");
      else await AsyncStorage.removeItem(key);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKey(serverId) }),
  });
}
