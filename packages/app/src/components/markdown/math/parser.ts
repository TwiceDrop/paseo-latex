import type MarkdownIt from "markdown-it";

export interface MathSpan {
  end: number;
  content: string;
  displayMode: boolean;
  complete: boolean;
}

function isEscaped(source: string, index: number): boolean {
  let slashes = 0;
  while (source[--index] === "\\") slashes++;
  return slashes % 2 === 1;
}

function getDelimiters(source: string, start: number): [string, string] | null {
  let opening: string;
  let closing: string;
  if (source.startsWith("$$", start)) {
    opening = closing = "$$";
  } else if (source.startsWith(String.raw`\[`, start)) {
    opening = String.raw`\[`;
    closing = String.raw`\]`;
  } else if (source.startsWith(String.raw`\(`, start)) {
    opening = String.raw`\(`;
    closing = String.raw`\)`;
  } else if (source[start] === "$") {
    opening = closing = "$";
    const next = source[start + 1];
    const previous = source[start - 1];
    if (!next || /\s/.test(next) || (previous && /[\d$]/.test(previous))) return null;
  } else {
    return null;
  }

  return [opening, closing];
}

function findClosingDelimiter(source: string, contentStart: number, closing: string): number {
  let end = source.indexOf(closing, contentStart);
  while (end !== -1) {
    const invalidDollarClose =
      closing === "$" && (/\s/.test(source[end - 1]) || /[\d$]/.test(source[end + 1] ?? ""));
    if (!isEscaped(source, end) && !invalidDollarClose) break;
    end = source.indexOf(closing, end + closing.length);
  }
  return end;
}

function containsUnescapedDollar(source: string): boolean {
  for (let index = source.indexOf("$"); index !== -1; index = source.indexOf("$", index + 1)) {
    if (!isEscaped(source, index)) return true;
  }
  return false;
}

/** Shared with HTML preprocessing so markup inside TeX remains literal. */
export function findMathSpan(
  source: string,
  start: number,
  allowIncomplete = false,
): MathSpan | null {
  if (isEscaped(source, start)) return null;
  const delimiters = getDelimiters(source, start);
  if (!delimiters) return null;
  const [opening, closing] = delimiters;
  const displayMode = opening === "$$" || opening === String.raw`\[`;
  const contentStart = start + opening.length;
  const end = findClosingDelimiter(source, contentStart, closing);
  if (end === -1) {
    const currency = opening === "$" && /^\d/.test(source.slice(contentStart));
    const literalBracket =
      opening === String.raw`\[` &&
      source.slice(contentStart).trim().length > 0 &&
      !source.slice(contentStart).includes("\n");
    if (!allowIncomplete || currency || literalBracket) return null;
    return {
      end: source.length,
      content: source.slice(contentStart),
      displayMode,
      complete: false,
    };
  }
  const content = source.slice(contentStart, end);
  const nestedDollar = opening === "$" && containsUnescapedDollar(content);
  const invalidInline =
    !displayMode && (content.includes("\n") || content.trim().length === 0 || nestedDollar);
  if (invalidInline) return null;
  return { end: end + closing.length, content, displayMode, complete: true };
}

export function enableMathMarkdown(parser: MarkdownIt, { streaming = false } = {}): void {
  parser.inline.ruler.before("escape", "math", (state, silent) => {
    const span = findMathSpan(state.src.slice(0, state.posMax), state.pos, streaming);
    if (!span) return false;
    if (!silent) {
      let type = span.displayMode ? "math_block" : "math_inline";
      if (!span.complete) type = "math_pending";
      const token = state.push(type, "", 0);
      token.content = span.complete ? span.content : state.src.slice(state.pos, span.end);
      token.markup = state.src.slice(state.pos, span.end);
    }
    state.pos = span.end;
    return true;
  });

  parser.block.ruler.before(
    "fence",
    "math",
    (state, startLine, endLine, silent) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const indentedCode = state.sCount[startLine] - state.blkIndent >= 4;
      if (indentedCode) return false;
      const opening = state.src.slice(start, start + 2);
      if (opening !== "$$" && opening !== String.raw`\[`) return false;
      // getLines removes list indentation and quote prefixes already handled by markdown-it.
      const source = state.getLines(startLine, endLine, state.blkIndent, false).trimStart();
      const span = findMathSpan(source, 0, true);
      if (!span) return false;
      const raw = source.slice(0, span.end);
      const nextLine = Math.min(endLine, startLine + raw.trimEnd().split("\n").length);
      const lineEnd = source.indexOf("\n", span.end);
      const trailing = source.slice(span.end, lineEnd === -1 ? source.length : lineEnd);
      if (span.complete && trailing.trim()) return false;
      // A dollar prefix in ordinary prose ("$$price") is not a display block.
      if (!span.complete && state.src.slice(start + 2, state.eMarks[startLine]).trim())
        return false;
      if (silent) return true;
      const token = state.push(span.complete ? "math_block" : "math_pending", "", 0);
      token.block = true;
      token.content = span.complete ? span.content.trim() : raw;
      token.markup = raw;
      token.map = [startLine, nextLine];
      state.line = nextLine;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );

  // HTML clipboard output keeps the original TeX without requiring KaTeX CSS.
  for (const type of ["math_inline", "math_block", "math_pending"]) {
    parser.renderer.rules[type] = (tokens, index) => parser.utils.escapeHtml(tokens[index].markup);
  }
}
