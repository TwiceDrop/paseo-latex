import type { TextStyle } from "react-native";

export interface MarkdownMathProps {
  content: string;
  source: string;
  displayMode: boolean;
  inheritedStyles: TextStyle;
}
