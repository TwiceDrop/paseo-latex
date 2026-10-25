import { renderAsync } from "docx-preview";
import type { DocumentRequest } from "../messages";
import { checkOfficeArchive } from "../model";
import { button, element, fitPages } from "./controls";
import { renderPdf } from "./pdf";
import { renderSheets } from "./sheets";
import { renderSlides } from "./slides";
import { decodeDocumentText } from "./text";
import { decodeBase64 } from "./base64";

declare global {
  interface Window {
    __paseoDocument: DocumentRequest;
  }
}

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
    if (request.kind === "legacy") {
      root.replaceChildren(element("p", request.labels.legacy));
      document.body.dataset.status = "ready";
      return;
    }
    if (request.kind === "text") {
      const pre = element("pre", decodeDocumentText(bytes));
      root.replaceChildren(pre);
      document.body.dataset.status = "ready";
      return;
    }
    checkOfficeArchive(bytes);
    root.replaceChildren();
    switch (request.kind) {
      case "word": {
        await renderAsync(bytes, root, undefined, {
          useBase64URL: true,
          renderAltChunks: false,
          ignoreLastRenderedPageBreak: false,
        });
        let zoom = 1;
        const fit = () => fitPages(root, zoom);
        controls.append(
          button(request.labels.zoomOut, () => {
            zoom = Math.max(0.5, zoom - 0.25);
            fit();
          }),
          button(request.labels.zoomIn, () => {
            zoom = Math.min(3, zoom + 0.25);
            fit();
          }),
          button(request.labels.fit, () => {
            zoom = 1;
            fit();
          }),
        );
        fit();
        new ResizeObserver(fit).observe(root);
        break;
      }
      case "sheet":
        renderSheets(bytes, root, controls, request.labels);
        break;
      case "slides":
        await renderSlides(bytes, root, controls, request.labels);
        break;
      case "pdf":
        await renderPdf(bytes, root, controls, request.labels);
        break;
    }
    document.body.dataset.status = "ready";
  } catch (error) {
    document.body.dataset.status = "error";
    const message = error instanceof Error ? error.message : String(error);
    root.replaceChildren(element("p", request.labels.failed), element("pre", message));
    controls.replaceChildren(
      button(request.labels.retry, () => {
        void show();
      }),
    );
  }
}

void show();
