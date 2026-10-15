import type { ReactNode } from "react";
import type { TextStyle } from "react-native";
import type { ASTNode } from "react-native-markdown-display";
import type { MarkdownStyles } from "../renderer";

export interface MathTextGroupProps {
  node: ASTNode;
  parent: ASTNode[];
  styles: MarkdownStyles;
  inheritedStyles?: TextStyle;
  onLinkPress?: (href: string) => boolean;
}

// Browser math already shares prose layout; iOS retains native text.
export function renderAndroidMathTextGroup(_props: MathTextGroupProps): ReactNode | null {
  return null;
}
