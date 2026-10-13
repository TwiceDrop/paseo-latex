import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import Markdown from "react-native-markdown-display";
import { mathMarkdownRules } from "./rules";
import { createAssistantMarkdownParser } from "@/utils/assistant-markdown-parser";
import { createAssistantSelectionClipboardContent } from "@/assistant-selection-copy/content.web";
import { createMathDocument, parseMathDimensions, type MathDimensions } from "./document";
import { renderMath } from "./render";
import { page } from "vitest/browser";

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

interface MountedMarkdown {
  root: Root;
  host: HTMLDivElement;
}

const mounts: MountedMarkdown[] = [];
const frames: HTMLIFrameElement[] = [];
const markdownStyle = { body: { color: "white", fontSize: 16 } };

function mount(text: string, streaming = false): HTMLDivElement {
  const host = document.createElement("div");
  host.dataset.testid = "assistant-message";
  host.style.width = "320px";
  host.style.color = "white";
  host.style.background = "#18181b";
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <Markdown
        style={markdownStyle}
        rules={mathMarkdownRules}
        markdownit={createAssistantMarkdownParser({ streaming })}
      >
        {text}
      </Markdown>,
    ),
  );
  mounts.push({ root, host });
  return host;
}

function nativeDocumentDimensions(html: string): Promise<MathDimensions> {
  const frame = document.createElement("iframe");
  frame.style.width = "320px";
  frames.push(frame);
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", receive);
      reject(new Error("Native formula did not report its size"));
    }, 5000);
    function receive(event: MessageEvent): void {
      if (event.source !== frame.contentWindow) return;
      const dimensions = parseMathDimensions(event.data);
      if (!dimensions) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", receive);
      resolve(dimensions);
    }
    window.addEventListener("message", receive);
    frame.srcdoc = html;
    document.body.append(frame);
  });
}

afterEach(() => {
  for (const { root, host } of mounts.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  for (const frame of frames.splice(0)) frame.remove();
  window.getSelection()?.removeAllRanges();
});

describe("chat math", () => {
  it("renders inline fractions and display integrals with local fonts", async () => {
    const host = mount(String.raw`Inline $\frac{x_1}{2}$.

\[
\int_0^\infty e^{-x}\,dx = 1
\]`);
    await document.fonts.ready;
    expect(host.querySelectorAll(".katex").length).toBe(2);
    expect(host.querySelectorAll(".paseo-math-block").length).toBe(1);
    expect(document.fonts.check("16px KaTeX_Main")).toBe(true);
    expect(host.getBoundingClientRect().width).toBe(320);
    await page
      .elementLocator(host)
      .screenshot({ path: "../../../../../../artifacts/latex-chat-windows.png" });
  });

  it("scrolls wide formulas within the chat width", async () => {
    const formula = Array.from({ length: 30 }, (_, index) => `x_{${index}}`).join("+");
    const host = mount(`$$${formula}$$`);
    await document.fonts.ready;
    const math = host.querySelector<HTMLElement>(".paseo-math-block")!;
    expect(math.getBoundingClientRect().width).toBeLessThanOrEqual(320);
    expect(math.scrollWidth).toBeGreaterThan(math.clientWidth);
    expect(getComputedStyle(math).overflowX).toBe("auto");
  });

  it("preserves incomplete and invalid TeX as readable source", () => {
    const host = mount(String.raw`$\frac{x_1}{`, true);
    expect(host.textContent).toBe(String.raw`$\frac{x_1}{`);
    expect(host.querySelectorAll(".katex").length).toBe(0);
    const invalid = mount(String.raw`$\frac{$`);
    expect(invalid.textContent).toBe(String.raw`$\frac{$`);
  });

  it("copies selected formulas as their original LaTeX", () => {
    const source = String.raw`$\frac{x_1}{2}$`;
    const host = mount(source);
    const range = document.createRange();
    range.selectNodeContents(host);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(createAssistantSelectionClipboardContent(selection)?.plainText).toBe(source);
  });

  it("measures the Android document after its offline fonts load", async () => {
    const html = renderMath(String.raw`\frac{x_1}{2}`, false)!;
    const measured = await nativeDocumentDimensions(
      createMathDocument({
        html,
        id: "android-math",
        fontSize: 18,
        color: "white",
      }),
    );
    expect(measured.id).toBe("android-math");
    expect(measured.width).toBeGreaterThan(10);
    expect(measured.height).toBeGreaterThan(25);
  });
});
