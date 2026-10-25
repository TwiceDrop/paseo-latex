import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import * as pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import type { DocumentLabels } from "../messages";
import { button, element, observeContentWidth } from "./controls";
import { decodeBase64 } from "./base64";

declare global {
  interface Window {
    __paseoPdfResources: Record<string, string>;
  }
}

function resource(name: string): Uint8Array {
  const base64 = window.__paseoPdfResources[name];
  if (!base64) throw new Error(`Missing PDF resource: ${name}`);
  return decodeBase64(base64);
}

class LocalCMaps {
  async fetch({ name }: { name: string }) {
    return { cMapData: resource(`${name}.bcmap`), isCompressed: true };
  }
}

class LocalStandardFonts {
  async fetch({ filename }: { filename: string }) {
    return resource(filename);
  }
}

export async function renderPdf(
  bytes: Uint8Array,
  root: HTMLElement,
  controls: HTMLElement,
  labels: DocumentLabels,
): Promise<void> {
  // The bundled worker registers itself in this isolated viewer; no URL or CDN is used.
  void pdfWorker;
  const pdf = await getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: false,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    CMapReaderFactory: LocalCMaps,
    StandardFontDataFactory: LocalStandardFonts,
    WasmFactory: LocalStandardFonts,
  }).promise;
  let number = 1;
  let zoom = 1;
  let busy = false;
  let resizePending = false;
  const status = element("span");
  const canvas = element("canvas");
  const text = element("div");
  text.className = "pdf-text";
  root.replaceChildren(canvas, text);
  const previous = button(labels.previous, () => {
    number--;
    void show();
  });
  const next = button(labels.next, () => {
    number++;
    void show();
  });
  const smaller = button(labels.zoomOut, () => {
    zoom = Math.max(0.5, zoom - 0.25);
    void show();
  });
  const larger = button(labels.zoomIn, () => {
    zoom = Math.min(3, zoom + 0.25);
    void show();
  });
  const fit = button(labels.fit, () => {
    zoom = 1;
    void show();
  });
  const buttons = [previous, next, smaller, larger, fit];
  const retry = button(labels.retry, () => {
    void show();
  });
  retry.hidden = true;
  controls.append(previous, status, next, smaller, larger, fit, retry);

  async function show(resetScroll = true): Promise<void> {
    if (busy) {
      resizePending = true;
      return;
    }
    if (root.clientWidth <= 24) return;
    busy = true;
    resizePending = false;
    retry.hidden = true;
    buttons.forEach((control) => {
      control.disabled = true;
    });
    try {
      const page = await pdf.getPage(number);
      // The user may switch workspaces while getPage is pending.
      if (root.clientWidth <= 24) {
        page.cleanup();
        return;
      }
      const natural = page.getViewport({ scale: 1 });
      const scale = Math.min(2, (root.clientWidth - 24) / natural.width) * zoom;
      const viewport = page.getViewport({ scale });
      // Bound backing storage independently of CSS zoom, including unusually tall pages.
      const density = Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(4194304 / (viewport.width * viewport.height)),
        8192 / viewport.width,
        8192 / viewport.height,
      );
      // Release the old bitmap before resizing: the old height combined with a new
      // width can otherwise allocate a much larger intermediate canvas.
      canvas.width = 0;
      canvas.height = 0;
      canvas.width = Math.max(1, Math.floor(viewport.width * density));
      canvas.height = Math.max(1, Math.floor(viewport.height * density));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      try {
        await page.render({ canvas, viewport, transform: [density, 0, 0, density, 0, 0] }).promise;
        const content = await page.getTextContent();
        text.textContent = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
        status.textContent = `${number} / ${pdf.numPages}`;
      } finally {
        page.cleanup();
      }
      if (resetScroll) root.scrollTo(0, 0);
    } catch {
      text.textContent = labels.failed;
      retry.hidden = false;
    } finally {
      busy = false;
      buttons.forEach((control) => {
        control.disabled = false;
      });
      previous.disabled = number === 1;
      next.disabled = number === pdf.numPages;
      // A resize during PDF.js rendering must not be dropped or render concurrently
      // into the same canvas. The next pass uses the latest visible width.
      if (resizePending) void show(false);
    }
  }
  observeContentWidth(root, () => {
    void show(false);
  });
  await show();
}
