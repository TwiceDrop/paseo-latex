import { StyleSheet, useWindowDimensions, type TextStyle } from "react-native";
import { MathSurface } from "./surface.android";
import { renderMathTextGroup } from "./text-group";
import type { MathTextGroupProps } from "./group";

function MathTextGroup({
  html,
  source,
  style,
  linkColor,
  onLinkPress,
}: {
  html: string;
  source: string;
  style: TextStyle;
  linkColor?: string;
  onLinkPress?: (href: string) => boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const fontSize = (style.fontSize ?? 16) * fontScale;
  const lineHeight = style.lineHeight ? style.lineHeight * fontScale : fontSize * 1.4;
  const color = typeof style.color === "string" ? style.color : "#888888";
  const fontWeight = style.fontWeight;
  const id = JSON.stringify({ html, fontSize, lineHeight, color, fontWeight, linkColor });
  return (
    <MathSurface
      html={html}
      source={source}
      id={id}
      fontSize={fontSize}
      lineHeight={lineHeight}
      color={color}
      fontWeight={fontWeight}
      linkColor={linkColor}
      wrap
      onLinkPress={onLinkPress}
    />
  );
}

export function renderAndroidMathTextGroup({
  node,
  parent,
  styles,
  inheritedStyles,
  onLinkPress,
}: MathTextGroupProps) {
  // Android aligns an inline View's bottom with the text baseline and can cap its
  // line height. A shared browser text group gives math its own ascent/descent
  // and lets tall formulas expand the line while preserving CJK wrapping.
  const rendered = renderMathTextGroup(node);
  if (rendered === null) return null;
  const ancestors = [styles.body];
  for (let index = parent.length - 1; index >= 0; index--)
    ancestors.push(styles[parent[index].type]);
  const style = StyleSheet.flatten([...ancestors, styles.textgroup, inheritedStyles]);
  const linkColor = typeof styles.link?.color === "string" ? styles.link.color : undefined;
  return (
    <MathTextGroup
      key={node.key}
      {...rendered}
      style={style}
      linkColor={linkColor}
      onLinkPress={onLinkPress}
    />
  );
}
