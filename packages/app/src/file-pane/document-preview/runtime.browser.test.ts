import { afterEach, expect, it } from "vitest";
import { documentPreviewHtml } from "./html";
import type { DocumentKind } from "./model";
import type { DocumentLabels } from "./messages";

const labels: DocumentLabels = {
  loading: "Loading",
  failed: "Failed",
  retry: "Retry",
  previous: "Previous",
  next: "Next",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fit: "Fit",
  sheet: "Sheet",
  limitedColumns: "First 200 columns",
  legacy: "Convert first",
};
let frame: HTMLIFrameElement | undefined;
afterEach(() => {
  frame?.remove();
});

async function preview(kind: DocumentKind, source: string) {
  frame = document.createElement("iframe");
  frame.style.cssText = "width:420px;height:600px;border:0";
  // Prevent the regression itself allocating a giant bitmap in the test machine.
  const guard = `<script>
    for (const dimension of ['width', 'height']) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, dimension);
      Object.defineProperty(HTMLCanvasElement.prototype, dimension, { ...descriptor, set(value) {
        const other = this[dimension === 'width' ? 'height' : 'width'];
        if (value > 8192 || value * other > 4194304) {
          document.body.dataset.oversizedCanvas = 'true';
          throw new Error('Canvas exceeds test memory budget');
        }
        descriptor.set.call(this, value);
      }});
    }
  </script>`;
  frame.srcdoc = documentPreviewHtml({
    kind,
    bytes: new TextEncoder().encode(source),
    labels,
  }).replace("<script>window.__paseoDocument=", `${guard}<script>window.__paseoDocument=`);
  document.body.append(frame);
  await expect
    .poll(() => frame?.contentDocument?.body?.dataset.status, { timeout: 20000 })
    .toBe("ready");
  return frame.contentDocument!;
}

it("paginates wide sheets within a small cell budget without losing rows", async () => {
  const csv = Array.from({ length: 205 }, (_row, r) =>
    Array.from({ length: 200 }, (_column, c) => `R${r + 1}C${c + 1}`).join(","),
  ).join("\n");
  const doc = await preview("sheet", csv);
  expect(doc.querySelectorAll("td").length).toBeLessThanOrEqual(2000);
  expect(doc.querySelector("td")?.textContent).toBe("R1C1");
  const next = Array.from(doc.querySelectorAll("button")).find((b) => b.textContent === "Next")!;
  next.click();
  expect(doc.querySelector("td")?.textContent).toBe("R11C1");
  for (let i = 0; i < 19; i++) next.click();
  expect(next.disabled).toBe(true);
  expect(doc.querySelector("table")?.textContent).toContain("R205C200");
});

function tallPdf(): string {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 30000] /Resources << >> >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 4\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  return `${pdf}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
}

it("bounds tall PDF canvases while retaining zoom and fit controls", async () => {
  const doc = await preview("pdf", tallPdf());
  const canvas = doc.querySelector("canvas")!;
  expect(doc.body.dataset.oversizedCanvas).toBeUndefined();
  expect(doc.querySelector("#controls")?.textContent).toContain("1 / 1");
  expect(canvas.width * canvas.height).toBeLessThanOrEqual(4194304);
  expect(canvas.height).toBeLessThanOrEqual(8192);
  const initialWidth = parseFloat(canvas.style.width);
  const larger = Array.from(doc.querySelectorAll("button")).find(
    (b) => b.textContent === "Zoom in",
  )!;
  larger.click();
  await expect.poll(() => larger.disabled).toBe(false);
  expect(parseFloat(canvas.style.width)).toBeGreaterThan(initialWidth);
  expect(doc.body.dataset.oversizedCanvas).toBeUndefined();
  expect(canvas.width * canvas.height).toBeLessThanOrEqual(4194304);
});
