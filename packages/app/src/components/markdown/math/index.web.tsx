import { memo, useMemo } from "react";
import { MarkdownTextSpan } from "@/components/markdown-text";
import { renderMath } from "./render";
import type { MarkdownMathProps } from "./types";
import "./katex.gen.css";
import "./math.css";

export const MarkdownMath = memo(function MarkdownMath({
  content,
  source,
  displayMode,
  inheritedStyles,
}: MarkdownMathProps) {
  const html = useMemo(() => renderMath(content, displayMode), [content, displayMode]);
  const style = useMemo(
    () => ({
      color: typeof inheritedStyles.color === "string" ? inheritedStyles.color : undefined,
      fontSize: inheritedStyles.fontSize,
    }),
    [inheritedStyles.color, inheritedStyles.fontSize],
  );
  const innerHtml = useMemo(() => ({ __html: html ?? "" }), [html]);
  if (html === null) {
    return <MarkdownTextSpan style={inheritedStyles}>{source}</MarkdownTextSpan>;
  }
  const className = displayMode ? "paseo-math paseo-math-block" : "paseo-math";
  return (
    <span
      className={className}
      style={style}
      data-paseo-math-source={source}
      data-paseo-math-display={String(displayMode)}
      dangerouslySetInnerHTML={innerHtml}
    />
  );
});
