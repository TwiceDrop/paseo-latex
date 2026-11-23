import type { PluginRegistry } from "./registry";

type Registry = Pick<
  PluginRegistry,
  "installCatalog" | "removeHost" | "getSnapshot" | "setCatalogStatus"
>;
type Install = Parameters<Registry["installCatalog"]>;

/** Retain the last Host catalog so a device preference takes effect even while disconnected. */
export function createDeviceCatalog(serverId: string, registry: Registry) {
  let blocked = new Set<string>();
  let latest: { catalog: Install[1]; options: Omit<Install[2], "replacePluginId"> } | undefined;
  function install(catalog: Install[1], options: Install[2]) {
    return registry.installCatalog(
      serverId,
      catalog.filter((plugin) => !blocked.has(plugin.id)),
      options,
    );
  }
  const filtered: Registry = {
    getSnapshot: () => registry.getSnapshot(),
    setCatalogStatus: (host, status) => registry.setCatalogStatus(host, status),
    removeHost(host) {
      latest = undefined;
      registry.removeHost(host);
    },
    installCatalog(_host, catalog, options) {
      latest = { catalog, options: { client: options.client, audio: options.audio } };
      return install(catalog, options);
    },
  };
  return {
    registry: filtered,
    setBlocked(ids: readonly string[]) {
      if (ids.length === blocked.size && ids.every((id) => blocked.has(id))) return;
      blocked = new Set(ids);
      if (latest) install(latest.catalog, latest.options);
    },
  };
}
