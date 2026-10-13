import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const headlessSource = readFileSync(require.resolve("@xterm/headless"), "utf8");

function importHeadless(navigator: unknown): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  runInNewContext(headlessSource, { navigator, exports, module: { exports } }, { timeout: 2000 });
  return exports;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("navigator startup initialization", () => {
  it("allows native xterm to import with React Native's incomplete navigator", async () => {
    const navigator = { product: "ReactNative" };
    expect(() => importHeadless(navigator)).toThrow(/includes/);
    vi.stubGlobal("navigator", navigator);

    await import("./initialize-navigator");

    expect(typeof importHeadless(navigator).Terminal).toBe("function");
  });

  it("creates navigator when the runtime does not provide it", async () => {
    vi.stubGlobal("navigator", undefined);

    await import("./initialize-navigator");

    expect(typeof importHeadless(globalThis.navigator).Terminal).toBe("function");
  });

  it("preserves the browser's user agent and platform", async () => {
    const navigator = Object.freeze({ userAgent: "Mozilla/5.0 Chrome/130", platform: "Win32" });
    vi.stubGlobal("navigator", navigator);

    await import("./initialize-navigator");

    expect(globalThis.navigator).toBe(navigator);
    expect(typeof importHeadless(navigator).Terminal).toBe("function");
  });
});
