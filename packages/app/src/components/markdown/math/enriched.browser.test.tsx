import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import { createAssistantSelectionClipboardContent } from "@/assistant-selection-copy/content.web";
import { prepareMarkdownSource } from "../source";
import { prepareMathSource } from "./source";
import { createMarkdownStyles } from "../styles";
import { darkTheme } from "@/styles/theme";

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const flags = { latexMath: true, hardSoftBreaks: true };
const { markdownStyle } = createMarkdownStyles(darkTheme, { blockGap: 12 });
let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  window.getSelection()?.removeAllRanges();
});

function mount(source: string) {
  const prepared = prepareMathSource(source);
  const markdown = prepared.restore(prepareMarkdownSource(prepared.source).render());
  host = document.createElement("div");
  host.dataset.testid = "assistant-message";
  Object.assign(host.style, { width: "390px", padding: "16px", background: "#181b19" });
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <EnrichedMarkdownText
        markdown={markdown}
        flavor="github"
        md4cFlags={flags}
        markdownStyle={markdownStyle}
        selectable
      />,
    ),
  );
  return host;
}

it("renders inline and display formulas through the actual 0.12 Markdown engine", async () => {
  const container = mount(String.raw`中文行内公式 \(\frac{x_1^2}{2}\)，后面继续文字。

\[
G(y)=\begin{cases}
0, & y<0,\\
y, & 0\le y\le1,\\
1, & y>1.
\end{cases}
\]

下一段保留正常行距。`);
  await expect.poll(() => container.querySelectorAll('[role="math"] math').length).toBe(2);
  expect(container.textContent).toContain("下一段保留正常行距");
  const inlineMath = container.querySelector("math")!.getBoundingClientRect();
  const paragraph = container.querySelector("p")!.getBoundingClientRect();
  expect(getComputedStyle(container.querySelector('[role="math"]')!).color).toBe(
    getComputedStyle(container.querySelector("p")!).color,
  );
  expect(paragraph.height).toBeGreaterThanOrEqual(inlineMath.height);
  await page
    .elementLocator(container)
    .screenshot({ path: "../../../../../../artifacts/latex-0120-web.png" });
});

it("keeps currency, escaped dollars, inline code and fenced source literal", async () => {
  const container = mount(
    "Price $5 and $10. Escaped \\$x\\$. Code `$x$`.\n\n```tex\n$$x^2$$\n```\n\nActual: $y^2$.",
  );
  await expect.poll(() => container.querySelectorAll('[role="math"] math').length).toBe(1);
  expect(container.querySelector('[role="math"]')!.getAttribute("aria-label")).toBe("y^2");
  expect(container.textContent).toContain("$5 and $10");
  expect(container.querySelector("pre")!.textContent).toContain("$$x^2$$");
});

it("copies rendered MathML back to TeX without losing the source", async () => {
  const container = mount("Inline $x^2$.\n\n$$\n\\int_0^1 x\\,dx\n$$");
  await expect.poll(() => container.querySelectorAll('[role="math"] math').length).toBe(2);
  const range = document.createRange();
  range.selectNodeContents(container);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  const copied = createAssistantSelectionClipboardContent(selection)!.plainText;
  expect(copied).toContain("$x^2$");
  expect(copied).toContain("$$\\int_0^1 x\\,dx$$");
});
