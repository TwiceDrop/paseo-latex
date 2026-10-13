import { MarkdownTextSpan } from "@/components/markdown-text";
import type { MarkdownMathProps } from "./types";

// iOS keeps its selectable UITextView spans until an inline attachment renderer exists.
export function MarkdownMath({ source, inheritedStyles }: MarkdownMathProps) {
  return <MarkdownTextSpan style={inheritedStyles}>{source}</MarkdownTextSpan>;
}
