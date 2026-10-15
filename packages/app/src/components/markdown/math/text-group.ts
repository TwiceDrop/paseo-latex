import { renderMath } from "./render";

export interface MathTextNode {
  type: string;
  content: string;
  markup: string;
  attributes?: Record<string, string>;
  children: MathTextNode[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function containsMath(node: MathTextNode): boolean {
  return (
    node.type === "math_inline" || node.type === "math_block" || node.children.some(containsMath)
  );
}

export function renderMathTextGroup(node: MathTextNode): { html: string; source: string } | null {
  if (!containsMath(node)) return null;
  let source = "";
  function render(current: MathTextNode): string {
    if (current.type === "math_inline" || current.type === "math_block") {
      const raw = current.markup || current.content;
      source += raw;
      const html = renderMath(current.content, current.type === "math_block");
      return html === null
        ? escapeHtml(raw)
        : `<span class="math-inline" data-paseo-math-source="${escapeHtml(raw)}">${html}</span>`;
    }
    if (current.type === "softbreak" || current.type === "hardbreak") {
      source += "\n";
      return "<br>";
    }
    if (current.children.length === 0) {
      source += current.content;
      const content = escapeHtml(current.content);
      return current.type === "code_inline" ? `<code>${content}</code>` : content;
    }
    const content = current.children.map(render).join("");
    if (current.type === "strong") return `<strong>${content}</strong>`;
    if (current.type === "em") return `<em>${content}</em>`;
    if (current.type === "s") return `<s>${content}</s>`;
    if (current.type === "link") {
      const href = current.attributes?.href ?? "";
      if (/^(?:javascript|data|vbscript):/i.test(href.trim())) return content;
      return `<a href="${escapeHtml(href)}">${content}</a>`;
    }
    return content;
  }
  return { html: render(node), source };
}
