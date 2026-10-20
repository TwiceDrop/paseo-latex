import { fromMarkdown } from "mdast-util-from-markdown";
import type { Nodes } from "mdast";
import { findMathSpan } from "./parser";

interface SourceRange {
  start: number;
  end: number;
}

/** Keep TeX opaque to HTML, image, entity and file-link source adaptation. */
export function prepareMathSource(source: string, streaming = false) {
  const spans: SourceRange[] = [];
  if (!/\$|\\[([]/.test(source)) {
    return { source, spans, restore: (value: string) => value };
  }
  const protectedRanges: SourceRange[] = [];
  function protect(node: Nodes) {
    if (["code", "inlineCode", "link", "image", "definition"].includes(node.type)) {
      if (node.position) {
        protectedRanges.push({
          start: node.position.start.offset!,
          end: node.position.end.offset!,
        });
      }
    } else if ("children" in node) node.children.forEach(protect);
  }
  protect(fromMarkdown(source));
  for (const match of source.matchAll(/<(code|pre)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)) {
    protectedRanges.push({ start: match.index, end: match.index + match[0].length });
  }
  protectedRanges.sort((a, b) => a.start - b.start);
  let prefix = "PASEOMATHTOKEN";
  while (source.includes(prefix)) prefix += "X";
  const replacements: [string, string][] = [];
  let masked = "";
  let copied = 0;
  let rangeIndex = 0;
  for (let index = 0; index < source.length; index++) {
    while (protectedRanges[rangeIndex]?.end <= index) rangeIndex++;
    const protectedRange = protectedRanges[rangeIndex];
    if (protectedRange && protectedRange.start <= index) {
      index = protectedRange.end - 1;
      continue;
    }
    if (source[index] !== "$" && source[index] !== "\\") continue;
    const span = findMathSpan(source, index, streaming);
    if (!span) continue;
    const raw = source.slice(index, span.end);
    let normalized = raw;
    if (!span.complete) normalized = raw.replace(/[\\`*_[\]$]/g, "\\$&");
    else if (raw.startsWith(String.raw`\(`)) normalized = `$${raw.slice(2, -2)}$`;
    else if (raw.startsWith(String.raw`\[`)) normalized = `$$${raw.slice(2, -2)}$$`;
    const token = `${prefix}${replacements.length}END`;
    masked += source.slice(copied, index) + token;
    replacements.push([token, normalized]);
    spans.push({ start: index, end: span.end });
    copied = span.end;
    index = span.end - 1;
  }
  masked += source.slice(copied);
  return {
    source: masked,
    spans,
    restore(value: string) {
      for (const [token, raw] of replacements) value = value.replaceAll(token, () => raw);
      return value;
    },
  };
}

/** A streaming text view must never start or end halfway through a display formula. */
export function protectMathStreamingBoundary(source: string, boundary: number): number {
  const { spans } = prepareMathSource(source, true);
  const crossing = spans.find(({ start, end }) => start < boundary && boundary < end);
  return crossing ? source.lastIndexOf("\n", crossing.start - 1) + 1 : boundary;
}
