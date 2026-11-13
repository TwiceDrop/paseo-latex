import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { Button } from "@/components/ui/button";
import { SettingsCard, SettingsCollapsibleRow, SettingsRow } from "@/components/settings";
import { I18nextProvider } from "react-i18next";
import { i18n } from "@/i18n/i18next";
import { LatexAppUpdateRow } from "@/updates/latex-update-row";
import { parseLatexRelease } from "@/updates/latex-release";
import type { LatexUpdatePort } from "@/updates/latex-updater";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function mountRows() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <SettingsCard>
        <SettingsRow label="Card row" testID="card-row">
          <Button variant="outline" testID="card-button">
            Download
          </Button>
        </SettingsRow>
        <SettingsCollapsibleRow label="Group" defaultExpanded testID="group">
          <SettingsRow label="Nested with a button" testID="nested-with-button">
            <Button variant="outline" testID="nested-button">
              Download
            </Button>
          </SettingsRow>
          <SettingsRow label="Nested without a button" testID="nested-without-button" />
        </SettingsCollapsibleRow>
      </SettingsCard>,
    ),
  );
}

function element(testID: string): HTMLElement {
  const found = document.querySelector(`[data-testid="${testID}"]`);
  if (!(found instanceof HTMLElement)) throw new Error(`Nothing rendered as ${testID}`);
  return found;
}

function heightOf(testID: string): number {
  return element(testID).getBoundingClientRect().height;
}

function titleFontSize(rowTestID: string, label: string): number {
  const title = [...element(rowTestID).querySelectorAll("div")].find(
    (node) => node.textContent === label && node.children.length === 0,
  );
  if (!title) throw new Error(`No title ${label}`);
  return Number.parseFloat(getComputedStyle(title).fontSize);
}

describe("settings row density", () => {
  it("lines up nested rows with and without a button, tighter than card rows", () => {
    mountRows();

    expect(heightOf("nested-with-button")).toBe(heightOf("nested-without-button"));
    expect(heightOf("nested-with-button")).toBeLessThan(heightOf("card-row"));
    expect(heightOf("group-toggle")).toBeGreaterThan(heightOf("nested-without-button"));
  });

  it("sizes nested text and controls one step below card rows", () => {
    mountRows();

    expect(heightOf("nested-button")).toBeLessThan(heightOf("card-button"));
    expect(titleFontSize("nested-with-button", "Nested with a button")).toBeLessThan(
      titleFontSize("card-row", "Card row"),
    );
  });
});

function updateButton(label: string): HTMLElement {
  const button = [...element("latex-app-update").querySelectorAll("button,[role=button]")].find(
    (candidate) => candidate.textContent === label,
  );
  if (!(button instanceof HTMLElement)) throw new Error(`Missing ${label} button`);
  return button;
}

async function mountUpdater(port: LatexUpdatePort) {
  container = document.createElement("div");
  container.style.width = "390px";
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <I18nextProvider i18n={i18n}>
        <LatexAppUpdateRow port={port} />
      </I18nextProvider>,
    ),
  );
}

it("shows update progress, verification failures, retries and installation permission state", async () => {
  await i18n.changeLanguage("en");
  const release = parseLatexRelease({
    tag_name: "latex-v0.15.3-r2",
    draft: false,
    prerelease: false,
    assets: [
      {
        name: "paseo-latex-0.15.3-r2.apk",
        size: 100,
        hash_algo: "sha256",
        hash_value: "a".repeat(64),
      },
    ],
  });
  let complete!: () => void;
  let progress!: (value: number) => void;
  let attempts = 0;
  let installs = 0;
  const port: LatexUpdatePort = {
    installedVersionCode: 1500301,
    check: async () => release,
    download: async (_release, listener) => {
      if (++attempts === 1) throw new Error("Checksum mismatch");
      progress = listener;
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
    },
    cancelDownload() {},
    install: async () => (++installs === 1 ? "permission" : "installer"),
  };
  await mountUpdater(port);
  await act(async () => updateButton("Check for updates").click());
  expect(element("latex-app-update").textContent).toContain("0.15.3-r2");
  await act(async () => updateButton("Download update").click());
  expect(element("latex-app-update").textContent).toContain("Checksum mismatch");
  await act(async () => updateButton("Download update").click());
  act(() => progress(0.5));
  expect(element("latex-app-update").textContent).toContain("50%");
  expect(updateButton("Cancel")).toBeVisible();
  await act(async () => complete());
  expect(element("latex-app-update").textContent).toContain("verified");
  await act(async () => updateButton("Install update").click());
  expect(element("latex-app-update").textContent).toContain("Allow this app");
  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });
  expect(element("latex-app-update").textContent).toContain("返回后再次点击");
  await page
    .getByTestId("latex-app-update")
    .screenshot({ path: ".vitest-screenshots/latex-updater-permission.png" });
  await act(async () => updateButton("安装更新").click());
  expect(element("latex-app-update").textContent).toContain("系统安装界面");
  expect(attempts).toBe(2);
  expect(installs).toBe(2);
  await act(async () => {
    await i18n.changeLanguage("en");
  });
});
