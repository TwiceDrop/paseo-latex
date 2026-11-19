import { expect, test } from "../support/fixtures";
import { gotoAppShell, openSettings } from "../support/helpers/app";
import { installLocalDesktopHost } from "../support/helpers/local-desktop-host";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";

test.use({ hasTouch: true });

test("a compact Windows window keeps the chosen send shortcut", async ({ page }) => {
  test.setTimeout(120_000);
  const agent = await seedMockAgentWorkspace({ repoPrefix: "desktop-send-", title: "Send keys" });
  try {
    await installLocalDesktopHost(page, agent.cwd, "win32");
    await gotoAppShell(page);
    await openSettings(page);
    const selector = page.getByRole("button", { name: /^Send shortcut:/ });
    await expect(selector).toHaveAccessibleName("Send shortcut: Enter");
    await selector.click();
    await page.getByRole("menuitem", { name: "Ctrl+Enter", exact: true }).click();
    await expect(selector).toHaveAccessibleName("Send shortcut: Ctrl+Enter");

    // Opening the agent via its URL starts a new renderer and reads the stored choice.
    await openAgentRoute(page, agent);
    const composer = page.getByRole("textbox", { name: "Message agent..." });
    await expect(composer).toBeVisible();
    await page.setViewportSize({ width: 540, height: 880 });
    await composer.fill("New draft");
    await composer.press("Enter");
    await expect(composer).toHaveValue("New draft\n");
    await composer.fill("Ctrl sends");
    await composer.press("Control+Enter");
    await expect(page.getByText("Ctrl sends", { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 880 });
    await openSettings(page);
    await expect(selector).toHaveAccessibleName("Send shortcut: Ctrl+Enter");
    await selector.click();
    await page.getByRole("menuitem", { name: "Enter", exact: true }).click();
    await expect(selector).toHaveAccessibleName("Send shortcut: Enter");
    await openAgentRoute(page, agent);
    await expect(composer).toBeVisible();
    await page.setViewportSize({ width: 540, height: 880 });
    await composer.fill("First line");
    await composer.press("Shift+Enter");
    await expect(composer).toHaveValue("First line\n");
    await composer.fill("Enter sends");
    await composer.press("Enter");
    await expect(page.getByText("Enter sends", { exact: true })).toBeVisible();
  } finally {
    await agent.cleanup();
  }
});
