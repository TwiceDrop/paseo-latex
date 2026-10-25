import path from "node:path";
import { writeFile } from "node:fs/promises";
import { expect, test } from "../support/fixtures";
import { documentFixtures } from "../support/helpers/document-preview";
import { openFileExplorer, openFileFromExplorer } from "../support/helpers/file-explorer";
import { buildHostWorkspaceRoute } from "@/utils/host-routes";
import { getServerId } from "../support/helpers/server-id";
import {
  switchWorkspaceViaSidebar,
  workspaceDeckEntryLocator,
} from "../support/helpers/workspace-ui";

test("retained document workspaces switch without reloading their preview", async ({
  page,
  withWorkspace,
}, testInfo) => {
  test.setTimeout(120_000);
  const first = await withWorkspace({ prefix: "preview-switch-a-" });
  const second = await withWorkspace({ prefix: "preview-switch-b-" });
  const fixtures = await documentFixtures();
  await writeFile(path.join(first.repoPath, "preview.pdf"), fixtures["preview.pdf"]);
  let reads = 0;
  page.on("websocket", (socket) =>
    socket.on("framesent", ({ payload }) => {
      const message = String(payload);
      if (
        message.includes('"file_explorer_request"') &&
        message.includes('"mode":"file"') &&
        message.includes("preview.pdf")
      )
        reads++;
    }),
  );
  const serverId = getServerId();
  await page.goto(buildHostWorkspaceRoute(serverId, first.workspaceId));
  await openFileExplorer(page);
  await openFileFromExplorer(page, "preview.pdf");
  const viewer = page.frameLocator('[data-testid="document-preview"]:visible');
  await expect(viewer.locator(".pdf-text")).toContainText("PDF preview page 1");
  await viewer.getByRole("button", { name: "Next", exact: true }).click();
  await expect(viewer.locator(".pdf-text")).toContainText("PDF preview page 2");
  expect(reads).toBe(1);
  const samples: number[] = [];
  for (let i = 0; i < 3; i++) {
    for (const workspace of [second, first]) {
      const start = performance.now();
      await switchWorkspaceViaSidebar({ page, serverId, workspaceId: workspace.workspaceId });
      await expect(workspaceDeckEntryLocator(page, serverId, workspace.workspaceId)).toBeVisible();
      await page.evaluate(async () => {
        await new Promise<number>((resolve) => requestAnimationFrame(resolve));
        await new Promise<number>((resolve) => requestAnimationFrame(resolve));
      });
      samples.push(Math.round(performance.now() - start));
    }
  }
  await testInfo.attach("workspace-switch-samples", {
    body: JSON.stringify({ samplesMs: samples, fileReads: reads }),
    contentType: "application/json",
  });
  console.log(
    "Document workspace switching:",
    JSON.stringify({ samplesMs: samples, fileReads: reads }),
  );
  expect(reads).toBe(1);
  await expect(viewer.locator(".pdf-text")).toContainText("PDF preview page 2");
});

test("previews local Office, PDF and text documents over the workspace connection", async ({
  page,
  withWorkspace,
}) => {
  test.setTimeout(180_000);
  const workspace = await withWorkspace({ prefix: "document-preview-" });
  const fixtures = await documentFixtures();
  for (const [name, bytes] of Object.entries(fixtures))
    await writeFile(path.join(workspace.repoPath, name), bytes);
  await page.goto(buildHostWorkspaceRoute(getServerId(), workspace.workspaceId));
  async function open(name: string) {
    await openFileExplorer(page);
    await openFileFromExplorer(page, name);
    return page.frameLocator('[data-testid="document-preview"]:visible');
  }
  await test.step("Word paragraphs and table", async () => {
    const viewer = await open("preview.docx");
    await expect(viewer.getByText("Word 预览验证", { exact: true })).toBeVisible();
    await expect(viewer.locator("td").getByText("128.50", { exact: true })).toBeVisible();
    const pageSection = viewer.locator("section.docx").first();
    const before = await pageSection.boundingBox();
    await viewer.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect
      .poll(async () => (await pageSection.boundingBox())!.width)
      .toBeGreaterThan(before!.width);
    expect((await pageSection.boundingBox())!.x).toBeGreaterThanOrEqual(
      (await viewer.locator("#content").boundingBox())!.x,
    );
    await viewer.getByRole("button", { name: "Fit width", exact: true }).click();
    await page
      .getByTestId("document-preview")
      .screenshot({ path: "../../artifacts/document-word-web.png" });
  });
  await test.step("PowerPoint pages", async () => {
    const viewer = await open("preview.pptx");
    await expect(viewer.getByText("PowerPoint 预览第一页", { exact: true })).toBeVisible();
    await viewer.getByRole("button", { name: "Next", exact: true }).click();
    await expect(viewer.getByText("PowerPoint 第二页", { exact: true })).toBeVisible();
    await page
      .getByTestId("document-preview")
      .filter({ visible: true })
      .screenshot({ path: "../../artifacts/document-slides-web.png" });
  });
  for (const name of ["preview.xlsx", "preview.xls"]) {
    await test.step(`${name} sheets and row pages`, async () => {
      const viewer = await open(name);
      await expect(viewer.getByRole("cell", { name: "Paseo", exact: true })).toBeVisible();
      await viewer.getByRole("button", { name: "Next", exact: true }).click();
      await expect(viewer.getByRole("cell", { name: "row-199", exact: true })).toBeVisible();
      await viewer.getByRole("combobox", { name: "Worksheet" }).selectOption("明细");
      await expect(viewer.getByRole("cell", { name: "切换成功", exact: true })).toBeVisible();
    });
  }
  await test.step("CSV and UTF-16 log", async () => {
    const csv = await open("preview.csv");
    await expect(csv.getByRole("cell", { name: "Paseo", exact: true })).toBeVisible();
    await expect(csv.getByRole("cell", { name: "项目", exact: true })).toBeVisible();
    await expect((await open("preview.log")).locator("pre")).toHaveText("UTF-16 中文日志\n第二行");
  });
  await test.step("PDF page rendering and navigation", async () => {
    const viewer = await open("preview.pdf");
    await expect(viewer.locator(".pdf-text")).toContainText("PDF preview page 1");
    await expect(viewer.locator("canvas")).toBeVisible();
    await viewer.getByRole("button", { name: "Next", exact: true }).click();
    await expect(viewer.locator(".pdf-text")).toContainText("PDF preview page 2");
    await expect(viewer.locator(".pdf-text")).toContainText("中文");
    await page
      .getByTestId("document-preview")
      .filter({ visible: true })
      .screenshot({ path: "../../artifacts/document-pdf-web.png" });
  });
  await test.step("Corrupt document has an actionable error and download remains available", async () => {
    const viewer = await open("broken.docx");
    await expect(viewer.getByText("Failed to load file preview", { exact: true })).toBeVisible();
    await expect(viewer.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    await expect(page.getByTestId("file-panel-download").filter({ visible: true })).toBeEnabled();
    await openFileExplorer(page);
    await expect(page.getByTestId("file-explorer-tree-scroll")).toBeVisible();
  });
  await test.step("PDF waits for a visible layout and renders after returning to the pane", async () => {
    const viewer = await open("preview.pdf");
    await expect(viewer.locator(".pdf-text")).toContainText("PDF preview page 1");
    const frame = page.getByTestId("document-preview").filter({ visible: true });
    await frame.evaluate((node) => {
      const iframe = node as HTMLIFrameElement;
      const markup = iframe.srcdoc;
      iframe.id = "document-layout-probe";
      iframe.style.display = "none";
      iframe.srcdoc = markup;
    });
    const hiddenViewer = page.frameLocator("#document-layout-probe");
    await expect(hiddenViewer.locator("body")).toHaveAttribute("data-status", "waiting-layout");
    await page.locator("#document-layout-probe").evaluate((node) => {
      (node as HTMLIFrameElement).style.display = "";
    });
    await expect(hiddenViewer.locator(".pdf-text")).toContainText("PDF preview page 1");
    expect(
      await hiddenViewer
        .locator("canvas")
        .evaluate((canvas) => (canvas as HTMLCanvasElement).width),
    ).toBeGreaterThan(0);
  });
});
