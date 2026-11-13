import { expect, test } from "../support/fixtures";
import { clickNewChat } from "../support/helpers/launcher";
import { expectComposerVisible } from "../support/helpers/composer";
import { expectAgentIdle } from "../support/helpers/agent-stream";
import {
  openAttachmentMenu,
  expectAttachmentSheetRowsOnTitleRail,
  openGithubPickerFromMenu,
  attachImageFromMenu,
  expectAttachmentPill,
  removeAttachmentPill,
  openImageLightbox,
  closeImageLightbox,
  pressInterruptShortcut,
  expectComposerDraft,
  expectComposerDisabled,
  expectComposerEditable,
  expectAttachButtonDisabled,
  fillComposerDraft,
  submitMessage,
  dropFileOnComposer,
  sendDraftToQueue,
  expectQueuedMessageButton,
  startRunningMockAgent,
  selectGithubOption,
  expectGithubAttachmentPill,
  openGithubWorkspace,
} from "../support/helpers/composer";
import {
  delayBrowserAgentCreatedStatus,
  openNewWorkspaceComposer,
} from "../support/helpers/new-workspace";
import { gotoAppShell } from "../support/helpers/app";
import {
  waitForSidebarHydration,
  switchWorkspaceViaSidebar,
} from "../support/helpers/workspace-ui";
import { seedWorkspace } from "../support/helpers/seed-client";
import { hasGithubAuth, createTempGithubRepo } from "../support/helpers/github-fixtures";
import { getServerId } from "../support/helpers/server-id";
import { openFileExplorer } from "../support/helpers/file-explorer";
import { attachFileFromMenu, controlFileUploadCompletion } from "../support/helpers/composer";

const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const TEST_IMAGE = { name: "test.png", mimeType: "image/png", buffer: MINIMAL_PNG };
const TEST_JSON = {
  name: "config.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify({ composer: "drop" })),
};

test.describe("Composer attachments", () => {
  test("selected file shows a loading attachment until upload is acknowledged", async ({
    page,
    withWorkspace,
  }) => {
    const upload = await controlFileUploadCompletion(page);
    const workspace = await withWorkspace({ prefix: "attach-upload-pending-" });
    await workspace.navigateTo();
    await clickNewChat(page);
    await expectComposerVisible(page);

    upload.hold();
    await attachFileFromMenu(page, TEST_JSON);
    await upload.waitForUpload();

    const pending = page.getByTestId("composer-pending-file-attachment");
    await expect(pending).toContainText(TEST_JSON.name);
    await expect(pending.getByRole("progressbar")).toBeVisible();
    await expect(page.getByTestId("composer-file-attachment-pill")).toHaveCount(0);

    upload.complete();
    await expect(pending).toHaveCount(0);
    await expect(page.getByTestId("composer-file-attachment-pill")).toContainText(TEST_JSON.name);
    await expectComposerEditable(page);
  });

  test("compact Plus menu aligns attachment rows with its sheet title", async ({
    page,
    withWorkspace,
  }) => {
    test.setTimeout(60_000);
    const workspace = await withWorkspace({ prefix: "attach-sheet-rails-" });
    await workspace.navigateTo();
    await clickNewChat(page);
    await expectComposerVisible(page);
    await page.setViewportSize({ width: 390, height: 844 });

    await openAttachmentMenu(page);

    await expectAttachmentSheetRowsOnTitleRail(page);
  });

  test("GitHub combobox does not render until the picker is opened", async ({
    page,
    withWorkspace,
  }) => {
    test.setTimeout(60_000);
    const workspace = await withWorkspace({ prefix: "attach-gh-lazy-" });
    await workspace.navigateTo();
    await clickNewChat(page);
    await expectComposerVisible(page);

    await expect(page.getByTestId("combobox-desktop-container")).not.toBeVisible();

    await openGithubPickerFromMenu(page);

    await expect(page.getByPlaceholder("Search issues and PRs...")).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByTestId("combobox-empty-text").or(page.getByText("Searching...")),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("attaches an issue and a pull request from the repository picker", async ({ page }) => {
    test.setTimeout(120_000);
    if (!hasGithubAuth()) {
      test.skip(true, "GitHub auth not available in this environment");
    }
    const ghRepo = await createTempGithubRepo({
      category: "attachments",
      issues: [{ title: "fix: attachment issue" }],
      prs: [{ title: "feat: attachment pull request", state: "open" }],
    });
    const handle = await openGithubWorkspace(page, ghRepo.prs[0].localPath);
    try {
      await clickNewChat(page);
      await expectComposerVisible(page);
      // Choose from the repository list. Newly created repositories are not
      // necessarily available in GitHub's separate text-search index yet.
      await selectGithubOption(page, "", `issue:${ghRepo.issues[0].number}`);
      await expectGithubAttachmentPill(page, ghRepo.issues[0]);
      await selectGithubOption(page, "", `change_request:${ghRepo.prs[0].number}`);
      await expectGithubAttachmentPill(page, ghRepo.prs[0]);
      await expectGithubAttachmentPill(page, ghRepo.issues[0]);
    } finally {
      await handle.cleanup();
      await ghRepo.cleanup();
    }
  });

  test.fixme("workspace-review pill suppresses on X-click and reappears after send", async () => {
    // The review attachment is created via InlineReviewEditor in surface.tsx (addComment action).
    // Automating this requires: a workspace with staged changes, navigating to the diff panel,
    // hovering the gutter "+" button, typing a comment, and submitting. A dedicated
    // helpers/review.ts with addInlineReviewComment(page, filePath, lineNumber, comment) is
    // needed before this can be exercised end-to-end.
  });

  test("attaches, previews, and removes an image before dropping a file", async ({
    page,
    withWorkspace,
  }) => {
    test.setTimeout(60_000);
    const workspace = await withWorkspace({ prefix: "attach-lightbox-" });
    await workspace.navigateTo();
    await clickNewChat(page);
    await expectComposerVisible(page);

    await test.step("open the available attachment choices", async () => {
      await openAttachmentMenu(page);
      await expect(page.getByTestId("message-input-attachment-menu-item-image")).toBeVisible();
      await expect(page.getByTestId("message-input-attachment-menu-item-github")).toBeVisible();
      await page.keyboard.press("Escape");
    });

    await attachImageFromMenu(page, TEST_IMAGE);
    await expectAttachmentPill(page, "composer-image-attachment-pill");

    await openImageLightbox(page);
    await closeImageLightbox(page);

    await test.step("remove the image and attach a dropped file", async () => {
      await removeAttachmentPill(page, "composer-image-attachment-pill", "Remove image attachment");
      await expect(page.getByTestId("composer-image-attachment-pill")).toHaveCount(0);
      await dropFileOnComposer(page, TEST_JSON);
      await expectAttachmentPill(page, "composer-file-attachment-pill");
    });
  });

  test("dropped JSON file renders as a file attachment in New Workspace", async ({ page }) => {
    test.setTimeout(120_000);
    const workspace = await seedWorkspace({ repoPrefix: "attach-drop-new-workspace-" });

    try {
      await gotoAppShell(page);
      await waitForSidebarHydration(page);
      await switchWorkspaceViaSidebar({
        page,
        serverId: getServerId(),
        workspaceId: workspace.workspaceId,
      });

      await openNewWorkspaceComposer(page, {
        projectKey: workspace.projectKey,
        projectDisplayName: workspace.projectDisplayName,
      });

      await dropFileOnComposer(page, TEST_JSON);

      await expectAttachmentPill(page, "composer-file-attachment-pill");
    } finally {
      await workspace.cleanup();
    }
  });

  test("submitting while agent is running queues the message and clears the draft", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const agent = await startRunningMockAgent(page, {
      prefix: "attach-queue-",
      model: "one-minute-stream",
      prompt: "Stay running for queue test.",
    });
    try {
      await fillComposerDraft(page, "queued draft text");
      await sendDraftToQueue(page);

      await expectQueuedMessageButton(page);
      await expectComposerDraft(page, "");
    } finally {
      await agent.cleanup();
    }
  });

  test("Escape interrupt cancels the running agent and preserves composer draft", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const agent = await startRunningMockAgent(page, {
      prefix: "attach-interrupt-",
      model: "ten-second-stream",
      prompt: "Stay running for interrupt test.",
    });
    try {
      await fillComposerDraft(page, "preserve me");
      await pressInterruptShortcut(page);

      await expectAgentIdle(page, 15_000);
      await expectComposerDraft(page, "preserve me");
    } finally {
      await agent.cleanup();
    }
  });

  test("Escape cancels file creation without interrupting the running agent", async ({ page }) => {
    test.setTimeout(120_000);
    const agent = await startRunningMockAgent(page, {
      prefix: "file-create-escape-",
      model: "one-minute-stream",
      prompt: "Stay running while a file draft is cancelled.",
    });
    try {
      await openFileExplorer(page);
      await page.getByTestId("files-new-file").click();
      const nameInput = page.getByTestId("file-explorer-name-input");
      await expect(nameInput).toBeVisible();

      await nameInput.press("Escape");

      await expect(nameInput).toBeHidden();
      await expect(page.getByRole("button", { name: /stop|cancel/i }).first()).toBeVisible();
    } finally {
      await agent.cleanup();
    }
  });

  test("composer is locked while new workspace agent is being created", async ({ page }) => {
    test.setTimeout(120_000);
    const serverId = getServerId();

    const agentCreatedDelay = await delayBrowserAgentCreatedStatus(page);
    const workspace = await seedWorkspace({ repoPrefix: "attach-lock-" });

    try {
      await gotoAppShell(page);
      await waitForSidebarHydration(page);
      await switchWorkspaceViaSidebar({
        page,
        serverId,
        workspaceId: workspace.workspaceId,
      });

      await openNewWorkspaceComposer(page, {
        projectKey: workspace.projectKey,
        projectDisplayName: workspace.projectDisplayName,
      });
      await fillComposerDraft(page, "lock test prompt");
      const createButton = page
        .getByTestId("message-input-root")
        .getByRole("button", { name: "Create" });
      await expect(createButton).toBeVisible({ timeout: 30_000 });
      await createButton.click();

      await agentCreatedDelay.waitForCreateRequest();
      await agentCreatedDelay.waitForDelayedCreatedStatus();

      await expectComposerDisabled(page);
      await expectAttachButtonDisabled(page);

      agentCreatedDelay.release();

      await expectComposerEditable(page);
    } finally {
      agentCreatedDelay.release();
      await workspace.cleanup();
    }
  });
});

for (const mode of ["existing chat", "initial prompt"] as const) {
  test(`shared attachments survive a second device and a fresh history load: ${mode}`, async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(180_000);
    const agent = await startRunningMockAgent(page, {
      prefix: "shared-attachments-",
      model: "ten-second-stream",
      prompt: "Ready for shared attachments.",
    });
    let second: Awaited<ReturnType<typeof browser.newContext>> | undefined;
    try {
      await expectAgentIdle(page, 30_000);
      if (mode === "initial prompt") {
        await clickNewChat(page);
        await expectComposerVisible(page);
      }
      await attachImageFromMenu(page, TEST_IMAGE);
      await attachFileFromMenu(page, TEST_JSON);
      await expectAttachmentPill(page, "composer-file-attachment-pill");
      await submitMessage(page, "Shared image and file across devices");
      await expectComposerDraft(page, "");
      await expectAgentIdle(page, 30_000);
      await expect(
        page.getByRole("button", { name: "Open file: config.json", exact: true }),
      ).toBeVisible();
      let targetAgentId = agent.agentId;
      if (mode === "initial prompt") {
        await expect
          .poll(async () => {
            targetAgentId =
              (await agent.client.fetchAgents()).entries.find(
                (entry) => entry.agent.id !== agent.agentId,
              )?.agent.id ?? "";
            return targetAgentId;
          })
          .toBeTruthy();
      }
      const receiverUrl = new URL(page.url());
      receiverUrl.searchParams.set("open", `agent:${targetAgentId}`);
      const url = receiverUrl.href;
      const entries = await page.evaluate(() =>
        [
          "@paseo:daemon-registry",
          "@paseo:create-agent-preferences",
          "@paseo:app-settings",
          "@paseo:onboarding",
          "@paseo:e2e",
        ].map((name) => ({ name, value: localStorage.getItem(name)! })),
      );
      // Only pairing/preferences cross this boundary: no drafts, message cache, cookies or IndexedDB.
      second = await browser.newContext({
        storageState: {
          cookies: [],
          origins: [{ origin: new URL(url).origin, localStorage: entries }],
        },
      });
      const receiver = await second.newPage();
      const diagnostics: string[] = [];
      receiver.on("console", (m) => {
        if (m.type() === "error") diagnostics.push(m.text());
      });
      receiver.on("websocket", (ws) => {
        ws.on("framesent", (frame) => {
          if (typeof frame.payload === "string" && frame.payload.includes("file_explorer_request"))
            diagnostics.push(`send ${frame.payload}`);
        });
        ws.on("framereceived", (frame) => {
          if (typeof frame.payload === "string" && frame.payload.includes("file_explorer_response"))
            diagnostics.push(`receive ${frame.payload}`);
        });
      });
      receiver.on("close", () => {
        void testInfo.attach("receiver-file-requests", {
          body: diagnostics.join("\n"),
          contentType: "text/plain",
        });
      });
      await receiver.goto(url);
      await receiver.bringToFront();
      await expectComposerVisible(receiver);
      await expect(
        receiver
          .locator('[data-message-text="true"]')
          .filter({ hasText: "Shared image and file across devices" }),
      ).toBeVisible();
      await expect(
        receiver.getByRole("button", { name: "Open image attachment", exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        receiver.getByRole("button", { name: "Open file: config.json", exact: true }),
      ).toBeVisible();
      await receiver.getByRole("button", { name: "Open image attachment", exact: true }).click();
      await expect(receiver.getByTestId("attachment-lightbox")).toBeVisible();
      await expect
        .poll(() =>
          receiver
            .getByTestId("attachment-lightbox")
            .locator("img")
            .evaluateAll((images) => {
              for (const image of images) {
                if ((image as HTMLImageElement).naturalWidth > 0) return true;
              }
              return false;
            }),
        )
        .toBe(true);
      await closeImageLightbox(receiver);
      await expectAgentIdle(receiver, 30_000);
      await receiver
        .getByRole("button", { name: "Open image attachment", exact: true })
        .scrollIntoViewIfNeeded();
      await receiver.screenshot({ path: testInfo.outputPath("second-device-attachments.png") });
      await receiver.reload();
      await expect(
        receiver.getByRole("button", { name: "Open image attachment", exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        receiver.getByRole("button", { name: "Open file: config.json", exact: true }),
      ).toBeVisible();
      await expect(receiver.getByTestId("shared-attachments-error")).toHaveCount(0);
      await receiver.getByRole("button", { name: "Open file: config.json", exact: true }).click();
      await expect(
        receiver.getByTestId("file-panel-download").filter({ visible: true }),
      ).toBeEnabled();
    } finally {
      await second?.close().catch(() => undefined);
      await agent.cleanup();
    }
  });
}

test("shared attachment files survive an unmodified official 0.15.4 host restart", async () => {
  test.setTimeout(300_000);
  const { createHash, randomUUID } = await import("node:crypto");
  const { startIsolatedHostDaemon } = await import("../support/helpers/isolated-host-daemon");
  const { connectDaemonClient } = await import("../support/helpers/daemon-client-loader");
  const { build } = await import("esbuild");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { pathToFileURL } = await import("node:url");
  const path = await import("node:path");
  const bundleDirectory = await mkdtemp(path.join(tmpdir(), "paseo-shared-test-bundle-"));
  const bundle = path.join(bundleDirectory, "store.mjs");
  await build({
    entryPoints: [path.resolve(__dirname, "../../src/attachments/shared-message-store.ts")],
    outfile: bundle,
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const { createSharedMessageStore } = (await import(
    pathToFileURL(bundle).href
  )) as typeof import("../../src/attachments/shared-message-store");
  const host = await startIsolatedHostDaemon(`srv_official_${randomUUID()}`, {
    publishedVersion: "0.15.4",
  });
  const clients: import("@getpaseo/client/internal/daemon-client").DaemonClient[] = [];
  try {
    const connect = async () => {
      const client = await connectDaemonClient<
        import("@getpaseo/client/internal/daemon-client").DaemonClient
      >({ clientIdPrefix: "shared-attachments", port: host.port });
      clients.push(client);
      return client;
    };
    const sender = await connect();
    expect(sender.getLastServerInfoMessage()?.version).toBe("0.15.4");
    const options = {
      home: host.paseoHome,
      serverId: host.serverId,
      digest: async (text: string) => createHash("sha256").update(text).digest("hex"),
    };
    const uploaded = await sender.uploadFile({
      fileName: TEST_JSON.name,
      mimeType: TEST_JSON.mimeType,
      bytes: TEST_JSON.buffer,
    });
    expect(uploaded.error).toBeNull();
    const input = {
      clientMessageId: "cross-device-official",
      images: [
        { data: MINIMAL_PNG.toString("base64"), mimeType: "image/png", fileName: "图片.png" },
      ],
      attachments: [uploaded.file!],
    };
    const saved = await createSharedMessageStore(sender, options).save(input);
    const second = await connect();
    expect(await createSharedMessageStore(second, options).read(input)).toEqual(saved);
    await sender.close();
    await second.close();
    await host.restart();
    const restoredClient = await connect();
    const restored = await createSharedMessageStore(restoredClient, options).read(input);
    expect(restored).toEqual(saved);
    const image = await restoredClient.readFile(host.paseoHome, restored!.images[0]!.path);
    expect(Buffer.from(image.bytes)).toEqual(MINIMAL_PNG);
    const file = await restoredClient.readFile(host.paseoHome, uploaded.file!.path);
    expect(Buffer.from(file.bytes)).toEqual(TEST_JSON.buffer);
  } finally {
    await Promise.all(clients.map((client) => client.close()));
    await host.close();
    await rm(bundleDirectory, { recursive: true, force: true });
  }
});
