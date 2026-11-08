import type { DocumentLabels } from "../messages";
import { element } from "./controls";

export function renderText(bytes: Uint8Array, root: HTMLElement): void {
  root.replaceChildren(element("pre", decodeDocumentText(bytes)));
}

export function renderLegacy(
  _bytes: Uint8Array,
  root: HTMLElement,
  _controls: HTMLElement,
  labels: DocumentLabels,
): void {
  root.replaceChildren(element("p", labels.legacy));
}

export function decodeDocumentText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("gb18030").decode(bytes);
  }
}
