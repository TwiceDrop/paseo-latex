import { renderAsync } from "docx-preview";
import type { DocumentLabels } from "../messages";
import { button, fitPages } from "./controls";

export async function renderWord(
  bytes: Uint8Array,
  root: HTMLElement,
  controls: HTMLElement,
  labels: DocumentLabels,
): Promise<void> {
  await renderAsync(bytes, root, undefined, {
    useBase64URL: true,
    renderAltChunks: false,
    ignoreLastRenderedPageBreak: false,
  });
  let zoom = 1;
  const fit = () => fitPages(root, zoom);
  controls.append(
    button(labels.zoomOut, () => {
      zoom = Math.max(0.5, zoom - 0.25);
      fit();
    }),
    button(labels.zoomIn, () => {
      zoom = Math.min(3, zoom + 0.25);
      fit();
    }),
    button(labels.fit, () => {
      zoom = 1;
      fit();
    }),
  );
  fit();
  new ResizeObserver(fit).observe(root);
}
