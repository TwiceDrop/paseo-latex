import type { LatexRelease } from "./latex-release";

export interface LatexUpdateState {
  status:
    | "idle"
    | "checking"
    | "current"
    | "available"
    | "downloading"
    | "ready"
    | "installing"
    | "permission"
    | "installer"
    | "error";
  release: LatexRelease | null;
  progress: number;
  error: string | null;
  downloaded: boolean;
}

export interface LatexUpdatePort {
  installedVersionCode: number;
  check(signal: AbortSignal): Promise<LatexRelease>;
  download(release: LatexRelease, progress: (fraction: number) => void): Promise<void>;
  cancelDownload(): void;
  install(release: LatexRelease): Promise<"permission" | "installer">;
}

export function createLatexUpdater(port: LatexUpdatePort) {
  let state: LatexUpdateState = {
    status: "idle",
    release: null,
    progress: 0,
    error: null,
    downloaded: false,
  };
  const listeners = new Set<() => void>();
  let generation = 0;
  let checkAbort: AbortController | null = null;
  let busy = false;
  const publish = (patch: Partial<LatexUpdateState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const fail = (error: unknown) =>
    publish({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async check() {
      if (busy) return;
      busy = true;
      const operation = ++generation;
      const controller = new AbortController();
      checkAbort = controller;
      const timeout = setTimeout(() => controller.abort(), 15_000);
      publish({ status: "checking", error: null, release: null, progress: 0, downloaded: false });
      try {
        const release = await port.check(controller.signal);
        if (operation !== generation) return;
        if (controller.signal.aborted) throw new Error("Update check timed out. Please retry.");
        publish({
          status: release.versionCode > port.installedVersionCode ? "available" : "current",
          release,
        });
      } catch (error) {
        if (operation === generation) fail(error);
      } finally {
        clearTimeout(timeout);
        if (operation === generation) {
          busy = false;
          checkAbort = null;
        }
      }
    },
    async download() {
      const release = state.release;
      if (busy || !release || release.versionCode <= port.installedVersionCode) return;
      busy = true;
      const operation = ++generation;
      publish({ status: "downloading", error: null, progress: 0, downloaded: false });
      try {
        await port.download(release, (fraction) => {
          if (operation === generation) publish({ progress: Math.min(1, Math.max(0, fraction)) });
        });
        if (operation === generation) publish({ status: "ready", progress: 1, downloaded: true });
      } catch (error) {
        if (operation === generation) fail(error);
      } finally {
        if (operation === generation) busy = false;
      }
    },
    async install() {
      if (busy || !state.release || !state.downloaded) return;
      busy = true;
      const operation = ++generation;
      publish({ status: "installing", error: null });
      try {
        const status = await port.install(state.release);
        if (operation === generation) publish({ status, error: null });
      } catch (error) {
        if (operation === generation) {
          publish({ downloaded: false });
          fail(error);
        }
      } finally {
        if (operation === generation) busy = false;
      }
    },
    cancel() {
      generation++;
      checkAbort?.abort();
      checkAbort = null;
      port.cancelDownload();
      busy = false;
      publish({
        status: state.release ? "available" : "idle",
        progress: 0,
        error: null,
        downloaded: false,
      });
    },
    dispose() {
      generation++;
      checkAbort?.abort();
      port.cancelDownload();
      listeners.clear();
    },
  };
}
