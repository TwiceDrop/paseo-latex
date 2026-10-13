import type { ReactNode } from "react";
import type { TextStyle } from "react-native";
import type { ASTNode, RenderRules } from "react-native-markdown-display";
import { MarkdownTextSpan } from "@/components/markdown-text";
import type { MarkdownStyles } from "../renderer";
import { MarkdownMath } from ".";

export const mathMarkdownRules: RenderRules = {
  math_inline: (
    node: ASTNode,
    _children: ReactNode[],
    _parent: ASTNode[],
    _styles: MarkdownStyles,
    inheritedStyles: TextStyle = {},
  ) => (
    <MarkdownMath
      key={node.key}
      content={node.content}
      source={node.markup}
      displayMode={false}
      inheritedStyles={inheritedStyles}
    />
  ),
  math_block: (
    node: ASTNode,
    _children: ReactNode[],
    _parent: ASTNode[],
    styles: MarkdownStyles,
  ) => (
    <MarkdownMath
      key={node.key}
      content={node.content}
      source={node.markup}
      displayMode
      inheritedStyles={styles.body}
    />
  ),
  math_pending: (
    node: ASTNode,
    _children: ReactNode[],
    _parent: ASTNode[],
    _styles: MarkdownStyles,
    inheritedStyles: TextStyle = {},
  ) => (
    <MarkdownTextSpan key={node.key} style={inheritedStyles}>
      {node.content}
    </MarkdownTextSpan>
  ),
};
