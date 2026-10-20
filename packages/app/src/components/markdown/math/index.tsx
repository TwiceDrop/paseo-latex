import { Text as MarkdownTextSpan } from "react-native";
import type { MarkdownMathProps } from "./types";

// iOS keeps its selectable UITextView spans until an inline attachment renderer exists.
export function MarkdownMath({ source, inheritedStyles }: MarkdownMathProps) {
  return <MarkdownTextSpan style={inheritedStyles}>{source}</MarkdownTextSpan>;
}
