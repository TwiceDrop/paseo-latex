import { expect, test } from "../support/fixtures";
import {
  closeDiagramFullscreen,
  closeDiagramFullscreenFromOutside,
  expectCompletedDiagram,
  expectFullscreenDiagram,
  expectFullscreenDiagramClosed,
  openDiagramFullscreen,
  requestDiagram,
  waitForDiagramTurnToComplete,
  zoomAndPanFullscreenDiagram,
} from "../support/helpers/diagram";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";

const MERMAID_DIAGRAM = [
  "```mermaid",
  "flowchart LR",
  "  Start --> Middle",
  "  Middle --> Review",
  "  Review --> Ship",
  "```",
].join("\n");

test("opens a Mermaid diagram fullscreen and closes it again", async ({ page }) => {
  test.setTimeout(120_000);
  const runtimeRequests: string[] = [];
  page.on("request", (request) => {
    if (/mermaid\.gen\.html/.test(request.url())) runtimeRequests.push(request.url());
  });

  const agent = await seedMockAgentWorkspace({
    repoPrefix: "mermaid-fullscreen-",
    title: "Fullscreen Mermaid",
    featureValues: {
      mockStreamingAssistantResponse: MERMAID_DIAGRAM,
      mockStreamingAssistantIntervalMs: 10,
    },
  });
  try {
    await test.step("Open the conversation and wait for the rendered diagram", async () => {
      await openAgentRoute(page, agent);
      expect(runtimeRequests).toEqual([]);
      await requestDiagram(agent);
      await waitForDiagramTurnToComplete(agent);
      await expectCompletedDiagram(page, ["Start", "Ship"]);
      expect(runtimeRequests).toHaveLength(1);
    });

    await test.step("The toolbar opens the diagram fullscreen", async () => {
      await openDiagramFullscreen(page);
      await expectFullscreenDiagram(page, ["Start", "Review", "Ship"]);
    });

    await test.step("The fullscreen diagram zooms with the wheel and pans by dragging", async () => {
      await zoomAndPanFullscreenDiagram(page);
    });

    await test.step("The close action returns to the conversation", async () => {
      await closeDiagramFullscreen(page);
      await expectFullscreenDiagramClosed(page);
      await expectCompletedDiagram(page, ["Start", "Ship"]);
    });

    await test.step("Escape closes the fullscreen diagram", async () => {
      await openDiagramFullscreen(page);
      await expectFullscreenDiagram(page, ["Start", "Ship"]);
      await page.keyboard.press("Escape");
      await expectFullscreenDiagramClosed(page);
    });

    await test.step("Clicking outside the diagram closes the fullscreen viewer", async () => {
      await openDiagramFullscreen(page);
      await expectFullscreenDiagram(page, ["Start", "Ship"]);
      await closeDiagramFullscreenFromOutside(page);
      await expectFullscreenDiagramClosed(page);
      // Fullscreen shares the packaged resource; it never downloads it again.
      expect(runtimeRequests).toHaveLength(1);
    });
  } finally {
    await agent.cleanup();
  }
});

test("keeps Mermaid source readable when its resource fails and retries on request", async ({
  page,
}) => {
  test.setTimeout(120_000);
  let attempts = 0;
  await page.route(/mermaid\.gen\.html/, async (route) => {
    attempts++;
    if (attempts === 1) await route.fulfill({ status: 503, body: "unavailable" });
    else await route.continue();
  });
  const agent = await seedMockAgentWorkspace({
    repoPrefix: "mermaid-resource-retry-",
    title: "Mermaid resource retry",
    featureValues: {
      mockStreamingAssistantResponse: MERMAID_DIAGRAM,
      mockStreamingAssistantIntervalMs: 10,
    },
  });
  try {
    await openAgentRoute(page, agent);
    expect(attempts).toBe(0);
    await requestDiagram(agent);
    await waitForDiagramTurnToComplete(agent);
    const error = page.getByTestId("mermaid-resource-error");
    await expect(error).toBeVisible();
    await expect(page.getByText("flowchart LR", { exact: false }).first()).toBeVisible();
    expect(attempts).toBe(1);
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await expectCompletedDiagram(page, ["Start", "Ship"]);
    await expect(error).toHaveCount(0);
    expect(attempts).toBe(2);
  } finally {
    await agent.cleanup();
  }
});
