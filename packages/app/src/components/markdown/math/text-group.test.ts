import { describe, expect, it } from "vitest";
// @ts-expect-error -- This package utility has no standalone type declaration.
import tokensToAST from "react-native-markdown-display/src/lib/util/tokensToAST";
import { createAssistantMarkdownParser } from "@/utils/assistant-markdown-parser";
import { renderMathTextGroup } from "./text-group";

function render(text: string, streaming = false) {
  const ast = tokensToAST(createAssistantMarkdownParser({ streaming }).parse(text, {}));
  return renderMathTextGroup(ast[0]);
}

describe("Android math prose", () => {
  it("keeps Chinese prose and its inline formulas in one typeset paragraph", () => {
    const result = render(
      String.raw`因此，**“$Y$ 不超过 $6$”和“$X$ 不超过 $3$”是同一个事件**，它们的概率相同：`,
    )!;
    expect(result.source).toBe(
      "因此，“$Y$ 不超过 $6$”和“$X$ 不超过 $3$”是同一个事件，它们的概率相同：",
    );
    expect(result.html.match(/class="katex"/g)).toHaveLength(4);
    expect(result.html).toContain("<strong>“");
    expect(result.html).toContain("是同一个事件</strong>，它们的概率相同：");
  });

  it("preserves links, code, emphasis and pending or invalid formula source", () => {
    const result = render(
      String.raw`[$Y$ 链接](https://example.com?a=1&b=2) *说明* ` + "`<x>` " + String.raw`$\frac{$`,
      true,
    )!;
    expect(result.html).toContain('href="https://example.com?a=1&amp;b=2"');
    expect(result.html).toContain("<em>说明</em>");
    expect(result.html).toContain("<code>&lt;x&gt;</code>");
    expect(result.html).toContain(String.raw`$\frac{$`);
  });

  it("leaves prose without formulas on its native text renderer", () => {
    expect(render("正常段落与 `code`。 ")).toBeNull();
  });
});
