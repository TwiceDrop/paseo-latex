import { describe, expect, it } from "vitest";
import { prepareMarkdownSource } from "../source";
import { splitStreamingMarkdown } from "../streaming";
import { prepareMathSource, protectMathStreamingBoundary } from "./source";

describe("math in the enriched Markdown renderer", () => {
  it("normalizes both TeX delimiter forms after protecting their contents from source adapters", () => {
    const source = String.raw`中文 \(x_1^2\)，以及

\[
\begin{cases}
0, & y < 0 \\
\text{<b>literal</b> &lt; || /tmp/a.ts}, & y > 1
\end{cases}
\]`;
    const prepared = prepareMathSource(source);
    expect(prepared.spans).toHaveLength(2);
    const adapted = prepareMarkdownSource(prepared.source).render();
    expect(prepared.restore(adapted)).toBe(
      source
        .replace("\\(", "$")
        .replace("\\)", "$")
        .replace("\\[", () => "$$")
        .replace("\\]", () => "$$"),
    );
  });

  it.each([
    "Price $5 and $10.",
    String.raw`Escaped \$x\$.`,
    "Code `$x$`",
    "```tex\n\\[x^2\\]\n```",
    "    $x^2$\n",
    "[file](/tmp/$name$.txt)",
    "<code>$literal$</code>",
  ])("leaves non-formula source unchanged: %s", (source) => {
    const prepared = prepareMathSource(source);
    expect(prepared.spans).toEqual([]);
    expect(prepared.restore(prepared.source)).toBe(source);
  });

  it("preserves quote and list continuation markers inside display math", () => {
    const source = "> \\[\n> x = y\n> \\]\n\n- \\[\n  x = y\n  \\]";
    const prepared = prepareMathSource(source);
    expect(prepared.restore(prepared.source)).toBe("> $$\n> x = y\n> $$\n\n- $$\n  x = y\n  $$");
  });

  it("does not mistake a user-written placeholder for a formula", () => {
    const source = String.raw`PASEOMATHTOKEN0END and \(x\)`;
    const prepared = prepareMathSource(source);
    expect(prepared.restore(prepared.source)).toBe("PASEOMATHTOKEN0END and $x$");
  });

  it("keeps a multiline formula in a single native view at every streaming prefix", () => {
    const source = String.raw`Introduction.

$$
\begin{aligned}
a &= b \\

c &= d
\end{aligned}
$$

Following.
`;
    let previous = 0;
    for (let end = 0; end <= source.length; end++) {
      const prefix = source.slice(0, end);
      const proposed = splitStreamingMarkdown(prefix, true).head.length;
      const boundary = protectMathStreamingBoundary(prefix, proposed);
      expect(boundary).toBeGreaterThanOrEqual(previous);
      for (const span of prepareMathSource(prefix, true).spans) {
        expect(boundary <= span.start || boundary >= span.end).toBe(true);
      }
      previous = boundary;
    }
  });
});
