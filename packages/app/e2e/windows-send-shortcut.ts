import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron, expect, type Page } from "@playwright/test";
import { buildSeededHost } from "./support/helpers/daemon-registry";
import {
  startIsolatedHostDaemon,
  type IsolatedHostDaemon,
} from "./support/helpers/isolated-host-daemon";
import { buildAgentRoute, seedMockAgentWorkspace } from "./support/helpers/mock-agent";
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
    await page.goto(`${origin}/settings/general`);
    const selector = page.getByRole("button", { name: /^Send shortcut:/ });
    await selector.click();
    await page.getByRole("menuitem", { name: shortcut, exact: true }).click();
    await expect(selector).toHaveAccessibleName(`Send shortcut: ${shortcut}`);
    const route = buildAgentRoute(agent.workspaceId, agent.agentId, host.serverId);
    await page.goto(new URL(route, origin).href);
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
    await composer.fill("/exit");
    await expect(page.getByText("/exit", { exact: true }).first()).toBeVisible();
    await composer.press("Enter");
    await expect
      .poll(() => agent.client.fetchAgent({ agentId: agent.agentId }), { timeout: 15000 })
      .toMatchObject({ agent: { archivedAt: expect.any(String) } });
    console.log(`Verified ${shortcut}: stale Tab/Enter, ordinary newline/send, deliberate /exit.`);
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
      const app = await _electron.launch({
        executablePath,
        args: ["--lang=en-US"],
        env: { ...process.env, PASEO_ELECTRON_USER_DATA_DIR: userData },
      });
      try {
        const page = await app.firstWindow({ timeout: 30000 });
        page.setDefaultTimeout(30000);
        await page.waitForURL(`${origin}/**`);
        expect(await page.evaluate(() => window.paseoDesktop?.platform)).toBe("win32");
        await page.evaluate(
          (record) => {
            localStorage.setItem("@paseo:daemon-registry", JSON.stringify([record]));
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

        for (const shortcut of ["Ctrl+Enter", "Enter"] as const) {
          await verifyShortcut(page, host, shortcut);
        }
      } finally {
        await app.close();
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
