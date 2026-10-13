import { renderToString, ParseError } from "katex";

export function renderMath(content: string, displayMode: boolean): string | null {
  try {
    return renderToString(content, {
      displayMode,
      throwOnError: true,
      strict: "ignore",
      trust: false,
      maxSize: 20,
      maxExpand: 1000,
    });
  } catch (error) {
    if (error instanceof ParseError) return null;
    throw error;
  }
}
