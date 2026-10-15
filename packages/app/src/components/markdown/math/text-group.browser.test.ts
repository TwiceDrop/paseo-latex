import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error -- This package utility has no standalone type declaration.
import tokensToAST from "react-native-markdown-display/src/lib/util/tokensToAST";
import { createAssistantMarkdownParser } from "@/utils/assistant-markdown-parser";
import {
  createMathDocument,
  parseMathDimensions,
  type MathDocumentOptions,
  type MathDimensions,
} from "./document";
import { renderMathTextGroup } from "./text-group";

const frames: HTMLIFrameElement[] = [];
function paragraph(text: string) {
  return renderMathTextGroup(tokensToAST(createAssistantMarkdownParser().parse(text, {}))[0])!;
}
function waitForSize(frame: HTMLIFrameElement, id: string): Promise<MathDimensions> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", receive);
      reject(new Error("Paragraph measurement timed out"));
    }, 5000);
    function receive(event: MessageEvent) {
      if (event.source !== frame.contentWindow) return;
      const value = parseMathDimensions(event.data);
      if (value?.id !== id) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", receive);
      frame.style.height = `${value.height}px`;
      resolve(value);
    }
    window.addEventListener("message", receive);
  });
}
async function mount(options: MathDocumentOptions, width: number) {
  const frame = document.createElement("iframe");
  frames.push(frame);
  frame.style.width = `${width}px`;
  frame.style.border = "0";
  const measured = waitForSize(frame, options.id);
  frame.srcdoc = createMathDocument(options);
  document.body.append(frame);
  return { frame, size: await measured };
}
afterEach(() => {
  for (const frame of frames.splice(0)) frame.remove();
});

describe("Android math paragraph layout", () => {
  it.each([
    [320, 16],
    [390, 22],
    [280, 30],
  ])("aligns Chinese and formulas at width %i and font size %i", async (width, fontSize) => {
    const { html } = paragraph(
      String.raw`因此，**“$Y$ 不超过 $6$”和“$X$ 不超过 $3$”是同一个事件**，它们的概率相同：`,
    );
    const { frame, size } = await mount(
      { html, id: "mixed", fontSize, color: "white", lineHeight: fontSize * 1.4, wrap: true },
      width,
    );
    const doc = frame.contentDocument!;
    expect(size.width).toBe(width);
    expect(size.height).toBeGreaterThan(fontSize * 2);
    const root = doc.getElementById("math")!.getBoundingClientRect();
    const math = doc.querySelectorAll<HTMLElement>(".math-inline");
    expect(math.length).toBe(4);
    for (const element of math) {
      const probe = doc.createElement("span");
      probe.style.cssText = "display:inline-block;width:0;height:0";
      element.prepend(probe);
      const strut = element.querySelector<HTMLElement>(".katex-base > .katex-strut")!;
      const baseline =
        strut.getBoundingClientRect().bottom +
        (parseFloat(frame.contentWindow!.getComputedStyle(strut).verticalAlign) || 0);
      expect(Math.abs(baseline - probe.getBoundingClientRect().top)).toBeLessThan(1);
      const glyph = element.querySelector<HTMLElement>(".katex-html")!.getBoundingClientRect();
      expect(glyph.top).toBeGreaterThanOrEqual(root.top - 1);
      expect(glyph.bottom).toBeLessThanOrEqual(root.bottom + 1);
    }
  });

  it("resizes tall inline fractions and updates streamed text without reloading the document", async () => {
    const { frame, size } = await mount(
      {
        html: paragraph(String.raw`对 $0<y<1$，证明 $P(Y\le y)=y$。`).html,
        id: "first",
        fontSize: 20,
        color: "white",
        wrap: true,
      },
      180,
    );
    const doc = frame.contentDocument!;
    const options = {
      html: paragraph(
        String.raw`对 $0<y<1$，证明 $P(Y\le y)=y$。再计算 $\frac{\frac{x_1^2}{2}}{\sqrt{a^2+b^2}}$，继续换行说明。`,
      ).html,
      id: "updated",
      fontSize: 20,
      color: "white",
      wrap: true,
    };
    const measured = waitForSize(frame, options.id);
    const runtime = frame.contentWindow as Window & {
      __PASEO_MATH_UPDATE__: (value: MathDocumentOptions) => void;
    };
    runtime.__PASEO_MATH_UPDATE__(options);
    const next = await measured;
    expect(frame.contentDocument).toBe(doc);
    expect(next.height).toBeGreaterThan(size.height);
    expect(doc.querySelectorAll(".katex").length).toBe(3);
    expect(doc.getElementById("math")!.scrollWidth).toBe(180);
    expect(doc.querySelector(".katex-error")).toBeNull();
  });
});
