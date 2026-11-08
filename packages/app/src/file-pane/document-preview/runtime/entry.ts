import type { DocumentLabels, DocumentRequest } from "../messages";
import { checkOfficeArchive } from "../model";
import { button, element } from "./controls";
import { decodeBase64 } from "./base64";

declare global {
  interface Window {
    __paseoDocument: DocumentRequest;
  }
}

type DocumentRenderer = (
  bytes: Uint8Array,
  root: HTMLElement,
  controls: HTMLElement,
  labels: DocumentLabels,
) => void | Promise<void>;

export function startPreview(render: DocumentRenderer): void {
  const request = window.__paseoDocument;
  const root = document.getElementById("content")!;
  const controls = document.getElementById("controls")!;

  document.addEventListener(
    "click",
    (event) => {
      if (event.target instanceof Element && event.target.closest("a")) event.preventDefault();
    },
    true,
  );
  document.addEventListener("submit", (event) => event.preventDefault(), true);

  async function show(): Promise<void> {
    root.replaceChildren(element("p", request.labels.loading));
    controls.replaceChildren();
    try {
      if (root.clientWidth <= 24) {
        document.body.dataset.status = "waiting-layout";
        await new Promise<void>((resolve) => {
          const observer = new ResizeObserver(() => {
            if (root.clientWidth <= 24) return;
            observer.disconnect();
            resolve();
          });
          observer.observe(root);
        });
      }
      const bytes = decodeBase64(request.base64);
      if (request.kind !== "text" && request.kind !== "legacy") checkOfficeArchive(bytes);
      root.replaceChildren();
      await render(bytes, root, controls, request.labels);
      document.body.dataset.status = "ready";
    } catch (error) {
      document.body.dataset.status = "error";
      const message = error instanceof Error ? error.message : String(error);
      root.replaceChildren(element("p", request.labels.failed), element("pre", message));
      controls.replaceChildren(button(request.labels.retry, () => void show()));
    }
  }

  void show();
}
