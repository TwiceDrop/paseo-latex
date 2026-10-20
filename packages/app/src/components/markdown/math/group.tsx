import type { ReactNode } from "react";
import type { TextStyle, ViewStyle } from "react-native";
import type { ASTNode } from "react-native-markdown-display";
export type MarkdownStyles = Record<string, TextStyle & ViewStyle & { [key: string]: unknown }>;

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
