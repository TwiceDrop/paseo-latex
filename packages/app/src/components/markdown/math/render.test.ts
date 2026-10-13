import { describe, expect, it } from "vitest";
import { renderMath } from "./render";
import { createMathDocument, parseMathDimensions } from "./document";

describe("math rendering", () => {
  it("renders fractions with accessible TeX annotations", () => {
    const html = renderMath(String.raw`\frac{x_1}{2}`, false);
    expect(html).toContain('class="katex"');
    expect(html).toContain("mfrac");
    expect(html).toContain(String.raw`\frac{x_1}{2}`);
  });

  it("keeps invalid TeX available as source", () => {
    expect(renderMath(String.raw`\frac{`, false)).toBeNull();
  });

  it("does not allow TeX to insert links or fetch remote images", () => {
    expect(renderMath(String.raw`\href{javascript:alert(1)}{x}`, false)).not.toContain("href=");
    expect(
      renderMath(String.raw`\includegraphics{https://example.com/a.png}`, false),
    ).not.toContain("<img");
  });

  it("ships native fonts without network requests", () => {
    const html = createMathDocument({ html: "", id: "formula", color: "white", fontSize: 16 });
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).not.toContain("url(fonts/");
    expect(html).toContain("connect-src 'none'");
  });

  it.each([null, {}, { id: "x", width: -1, height: 40 }, { id: "x", width: Infinity, height: 40 }])(
    "rejects invalid native measurements: %j",
    (value) => {
      expect(parseMathDimensions(value)).toBeNull();
    },
  );
});
