import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { expect, type Browser, type Page } from "@playwright/test";
import { connectToPackagedApp, waitForPackagedAppPage } from "../../desktop/e2e/packaged-app-smoke";
import { killProcessTree } from "./support/helpers/spawn-node";
import { buildSeededHost } from "./support/helpers/daemon-registry";
import {
  startIsolatedHostDaemon,
  getAvailableHostDaemonPort,
  type IsolatedHostDaemon,
} from "./support/helpers/isolated-host-daemon";
import { openSettings } from "./support/helpers/app";
import { openSessions } from "./support/helpers/archive-tab";
import { seedMockAgentWorkspace } from "./support/helpers/mock-agent";
import { typeBeforeMenuFilters } from "./support/helpers/slash-menu";

const origin = "paseo://app";

async function verifyShortcut(
  page: Page,
  host: IsolatedHostDaemon,
  shortcut: "Enter" | "Ctrl+Enter",
) {
  const agent = await seedMockAgentWorkspace({
    port: host.port,
    repoPrefix: "send-keys-",
    title: `Send with ${shortcut}`,
  });
  try {
    await openSettings(page);
    const selector = page.getByRole("button", { name: /^Send shortcut:/ });
    await selector.click();
    await page.getByRole("menuitem", { name: shortcut, exact: true }).click();
    await expect(selector).toHaveAccessibleName(`Send shortcut: ${shortcut}`);
    await page.goto(`${origin}/`);
    await openSessions(page);
    await page.getByTestId(`agent-row-${host.serverId}-${agent.agentId}`).click();
    const composer = page.getByRole("textbox", { name: "Message agent..." });
    await expect(composer).toBeEditable({ timeout: 30_000 });
    for (const key of ["Tab", "Enter"] as const) {
      await composer.fill("/e");
      await expect(page.getByText("/exit", { exact: true }).first()).toBeVisible();
      await typeBeforeMenuFilters(composer, { text: "/co", key });
      await expect(composer).toHaveValue("/co");
      await expect(page.getByTestId("user-message").filter({ hasText: "/co" })).toHaveCount(0);
      expect(
        (await agent.client.fetchAgent({ agentId: agent.agentId }))?.agent.archivedAt,
      ).toBeNull();
    }
    await composer.fill("First line");
    await composer.press(shortcut === "Enter" ? "Shift+Enter" : "Enter");
    await expect(composer).toHaveValue("First line\n");
    const message = `Sent with ${shortcut}`;
    await composer.fill(message);
    await composer.press(shortcut === "Enter" ? "Enter" : "Control+Enter");
    await expect(page.getByTestId("user-message").filter({ hasText: message })).toBeVisible();
    await expect(composer).toHaveValue("");
    await agent.client.waitForFinish(agent.agentId, 30_000);
    await composer.fill("/qu");
    await expect(page.getByText("/exit", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await composer.press("Enter");
    await expect
      .poll(() => agent.client.fetchAgent({ agentId: agent.agentId }), { timeout: 15000 })
      .toMatchObject({ agent: { archivedAt: expect.any(String) } });
    console.log(`Verified ${shortcut}: stale Tab/Enter, ordinary newline/send, deliberate /exit.`);
  } catch (error) {
    console.error("Packaged renderer at", page.url(), await page.locator("body").ariaSnapshot());
    throw error;
  } finally {
    await agent.cleanup();
  }
}

async function verify(executablePath: string) {
  const host = await startIsolatedHostDaemon("srv_windows_shortcuts", { rendererOrigin: origin });
  try {
    const userData = await mkdtemp(path.join(tmpdir(), "paseo-shortcuts-"));
    try {
      await writeFile(
        path.join(userData, "desktop-settings.json"),
        JSON.stringify({
          version: 1,
          settings: { daemon: { manageBuiltInDaemon: false, keepRunningAfterQuit: false } },
          migrations: {
            legacyRendererSettingsImported: true,
            daemonStopOnQuitDefaultApplied: true,
          },
        }),
      );
      const cdpPort = await getAvailableHostDaemonPort();
      const child = spawn(executablePath, [], {
        stdio: "inherit",
        env: {
          ...process.env,
          PASEO_ELECTRON_USER_DATA_DIR: userData,
          PASEO_ELECTRON_FLAGS: `--lang=en-US --remote-debugging-address=127.0.0.1 --remote-debugging-port=${cdpPort}`,
        },
      });
      let browser: Browser | undefined;
      try {
        const deadline = Date.now() + 60_000;
        browser = await connectToPackagedApp({
          child,
          cdpPort,
          userData,
          daemonHome: path.join(userData, "daemon"),
          stdout: [],
          stderr: [],
          deadline,
        });
        const page: Page = await waitForPackagedAppPage(browser, deadline);
        page.setDefaultTimeout(30000);
        await page.waitForURL(`${origin}/**`);
        expect(await page.evaluate(() => window.paseoDesktop?.platform)).toBe("win32");
        await page.addInitScript(
          (record) => {
            localStorage.setItem("@paseo:daemon-registry", JSON.stringify([record]));
            if (!localStorage.getItem("@paseo:app-settings")) {
              localStorage.setItem("@paseo:app-settings", JSON.stringify({ language: "en" }));
            }
            localStorage.setItem(
              "@paseo:onboarding",
              JSON.stringify({ completedAt: new Date().toISOString() }),
            );
          },
          buildSeededHost({
            serverId: host.serverId,
            endpoint: `127.0.0.1:${host.port}`,
            nowIso: new Date().toISOString(),
          }),
        );

        await page.goto(`${origin}/`);
        for (const shortcut of ["Ctrl+Enter", "Enter"] as const) {
          await verifyShortcut(page, host, shortcut);
        }
      } finally {
        try {
          await browser?.close();
        } finally {
          await killProcessTree(child);
        }
      }
    } finally {
      await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  } finally {
    await host.close();
  }
}

verify(process.argv[2]).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
