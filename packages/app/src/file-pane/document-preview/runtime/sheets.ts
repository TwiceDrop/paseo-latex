import * as XLSX from "xlsx";
import type { DocumentLabels } from "../messages";
import { button, element } from "./controls";
import { decodeDocumentText } from "./text";

const ROWS_PER_PAGE = 200;
const MAX_COLUMNS = 200;
const MAX_CELLS_PER_PAGE = 2000;

export function renderSheets(
  bytes: Uint8Array,
  root: HTMLElement,
  controls: HTMLElement,
  labels: DocumentLabels,
): void {
  const binary =
    (bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf);
  const content = binary ? bytes : decodeDocumentText(bytes);
  const workbook = XLSX.read(content, {
    type: binary ? "array" : "string",
    cellHTML: false,
    cellFormula: false,
    cellStyles: false,
  });
  if (workbook.SheetNames.length === 0) throw new Error("No worksheets");
  const selector = element("select");
  selector.setAttribute("aria-label", labels.sheet);
  for (const name of workbook.SheetNames) {
    const option = element("option", name);
    option.value = name;
    selector.append(option);
  }
  let page = 0;
  const status = element("span");
  const previous = button(labels.previous, () => {
    page--;
    show();
  });
  const next = button(labels.next, () => {
    page++;
    show();
  });
  controls.append(selector, previous, status, next);
  selector.addEventListener("change", () => {
    page = 0;
    show();
  });

  function show(): void {
    const sheet = workbook.Sheets[selector.value];
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    const lastColumn = Math.min(range.e.c, range.s.c + MAX_COLUMNS - 1);
    const columns = lastColumn - range.s.c + 1;
    // Wide sheets need fewer rows per page to keep DOM/layout work bounded.
    const rowsPerPage = Math.min(
      ROWS_PER_PAGE,
      Math.max(1, Math.floor(MAX_CELLS_PER_PAGE / columns)),
    );
    const pages = Math.max(1, Math.ceil((range.e.r - range.s.r + 1) / rowsPerPage));
    status.textContent = `${page + 1} / ${pages}`;
    previous.disabled = page === 0;
    next.disabled = page + 1 >= pages;
    const table = element("table");
    const head = element("tr");
    head.append(element("th"));
    for (let column = range.s.c; column <= lastColumn; column++)
      head.append(element("th", XLSX.utils.encode_col(column)));
    table.append(head);
    const firstRow = range.s.r + page * rowsPerPage;
    const lastRow = Math.min(range.e.r, firstRow + rowsPerPage - 1);
    for (let row = firstRow; row <= lastRow; row++) {
      const tr = element("tr");
      tr.append(element("th", String(row + 1)));
      for (let column = range.s.c; column <= lastColumn; column++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
        tr.append(element("td", cell ? XLSX.utils.format_cell(cell) : ""));
      }
      table.append(tr);
    }
    root.replaceChildren(table);
    if (range.e.c > lastColumn) root.prepend(element("p", labels.limitedColumns));
    root.scrollTo(0, 0);
  }
  show();
}
