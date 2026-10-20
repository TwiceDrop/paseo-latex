import { describe, expect, it } from "vitest";
import { createAssistantMarkdownParser } from "./assistant-markdown-parser";

describe("createAssistantMarkdownParser", () => {
  it("recognizes formulas after a monetary amount", () => {
    const tokens = createAssistantMarkdownParser().parseInline("Price $5, formula $x^2$.", {})[0]
      .children!;
    expect(tokens.map((token) => [token.type, token.content])).toEqual([
      ["text", "Price $5, formula "],
      ["math_inline", "x^2"],
      ["text", "."],
    ]);
  });

  it("keeps quoted display math inside the quote", () => {
    const tokens = createAssistantMarkdownParser().parse("> $$\n> x = y\n> $$\n\nAfter", {});
    expect(
      tokens.filter((token) => token.type === "math_block").map((token) => token.content),
    ).toEqual(["x = y"]);
  });

  it("keeps display math inside a list item", () => {
    const tokens = createAssistantMarkdownParser().parse("- $$\n  x = y\n  $$\n- tail", {});
    expect(
      tokens.filter((token) => token.type === "math_block").map((token) => token.content),
    ).toEqual(["x = y"]);
    expect(tokens.filter((token) => token.type === "list_item_open").length).toBe(2);
  });

  it.each(["$x_1^2$", String.raw`\(x_1^2\)`])("recognizes inline math: %s", (source) => {
    const tokens = createAssistantMarkdownParser().parseInline(`Value: ${source}.`, {})[0]
      .children!;
    expect(tokens.map((token) => [token.type, token.content])).toEqual([
      ["text", "Value: "],
      ["math_inline", "x_1^2"],
      ["text", "."],
    ]);
  });

  it.each(["$$", String.raw`\[`])("recognizes multiline display math: %s", (opening) => {
    const closing = opening === "$$" ? "$$" : String.raw`\]`;
    const content = String.raw`\begin{aligned}
a &= b + c \\

d &= e
\end{aligned}`;
    const tokens = createAssistantMarkdownParser().parse(`${opening}\n${content}\n${closing}`, {});
    expect(tokens.map((token) => [token.type, token.content])).toEqual([["math_block", content]]);
  });

  it.each([
    "Price: $5 and $10.",
    String.raw`Escaped \$x\$.`,
    "`$x_1$`",
    "```tex\n$$x$$\n```",
    "    $$x$$",
  ])("leaves money and literal code alone: %s", (source) => {
    const tokens = createAssistantMarkdownParser().parse(source, {});
    const types: string[] = [];
    for (const token of tokens) {
      types.push(token.type);
      for (const child of token.children ?? []) types.push(child.type);
    }
    expect(types.filter((type) => type.startsWith("math_"))).toEqual([]);
  });

  it("keeps a streaming formula literal until its delimiter closes", () => {
    const parser = createAssistantMarkdownParser({ streaming: true });
    const source = String.raw`$\frac{x_1}{2}$`;
    for (let length = 2; length < source.length; length++) {
      const prefix = source.slice(0, length);
      const tokens = parser.parseInline(prefix, {})[0].children!;
      expect(tokens.map((token) => [token.type, token.content])).toEqual([
        ["math_pending", prefix],
      ]);
    }
    expect(parser.parseInline(source, {})[0].children!.map((token) => token.type)).toEqual([
      "math_inline",
    ]);
  });

  it("keeps ordinary parsing for completed messages", () => {
    const parser = createAssistantMarkdownParser();
    expect(parser.renderInline("**unfinished")).toBe("**unfinished");
    expect(parser.renderInline("[unfinished")).toBe("[unfinished");
  });

  it("renders agent text verbatim", () => {
    const parser = createAssistantMarkdownParser();

    // The reported bug, plus the substitutions that share its cause.
    expect(parser.renderInline("(c) (C) (r) (tm) (p)")).toBe("(c) (C) (r) (tm) (p)");
    expect(parser.renderInline("wait for it...")).toBe("wait for it...");
    expect(parser.renderInline("a -- b")).toBe("a -- b");
    // Smart quotes are off too: a curled quote is not pasteable into a shell.
    expect(parser.renderInline(`run --name="my repo"`)).toBe("run --name=&quot;my repo&quot;");
    expect(parser.renderInline("it's fine")).toBe("it's fine");
  });

  it("allows file:// links, unlike every other parser", () => {
    const parser = createAssistantMarkdownParser();

    expect(parser.render("[open](file:///tmp/a.ts)")).toContain('href="file:///tmp/a.ts"');
  });

  it("still rejects javascript: links", () => {
    const parser = createAssistantMarkdownParser();

    expect(parser.render("[x](javascript:alert(1))")).not.toContain("href");
  });
});
