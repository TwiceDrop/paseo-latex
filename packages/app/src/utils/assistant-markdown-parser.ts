import type MarkdownIt from "markdown-it";
import { createMarkdownParser } from "@/utils/markdown-parser";
import { enableMathMarkdown } from "@/components/markdown/math/parser";

export function createAssistantMarkdownParser({ streaming = false } = {}): MarkdownIt {
  const parser = createMarkdownParser({ linkify: true });
  enableMathMarkdown(parser, { streaming });
  const defaultValidateLink = parser.validateLink.bind(parser);

  // Rich clipboard HTML preserves workspace file links.
  parser.validateLink = (url: string) =>
    url.trim().toLowerCase().startsWith("file://") || defaultValidateLink(url);

  return parser;
}
