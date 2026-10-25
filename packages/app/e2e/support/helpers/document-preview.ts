import JSZip from "jszip";
import * as XLSX from "xlsx";

export async function documentFixtures(): Promise<Record<string, Uint8Array>> {
  const packageName = "@office-kit/pptx";
  const {
    createPresentation,
    getSlideLayouts,
    addSlide,
    addSlideTextBox,
    inches,
    savePresentation,
    setShapeTextFormat,
  }: typeof import("@office-kit/pptx") = await import(packageName);
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>Word 预览验证</w:t></w:r></w:p><w:p><w:r><w:t>段落、中文和表格保留。</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblW w:w="5000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2500"/><w:gridCol w:w="2500"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>项目</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>金额</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Paseo</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>128.50</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:br w:type="page"/><w:t>第二页</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:left="720" w:right="720" w:bottom="720"/></w:sectPr></w:body></w:document>`,
  );
  const word = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const pres = createPresentation();
  const layout = getSlideLayouts(pres)[0];
  for (const text of ["PowerPoint 预览第一页", "PowerPoint 第二页"]) {
    const slide = addSlide(pres, { layout });
    const shape = addSlideTextBox(slide, {
      x: inches(0.5),
      y: inches(0.7),
      w: inches(8),
      h: inches(1.5),
      text,
    });
    setShapeTextFormat(shape, { size: 32 });
  }
  const sheet = XLSX.utils.aoa_to_sheet([
    ["项目", "金额"],
    ["Paseo", 128.5],
  ]);
  const rows = Array.from({ length: 401 }, (_, index) => [`row-${index + 1}`, index + 1]);
  XLSX.utils.sheet_add_aoa(sheet, rows, { origin: "A3" });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "预算");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["第二张工作表"], ["切换成功"]]),
    "明细",
  );
  return {
    "preview.docx": word,
    "preview.pptx": await savePresentation(pres),
    "preview.xlsx": new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" })),
    "preview.xls": new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "biff8" })),
    "preview.csv": new TextEncoder().encode("项目,金额\nPaseo,128.50\n"),
    "preview.log": new Uint8Array([
      0xff,
      0xfe,
      ...Buffer.from("UTF-16 中文日志\n第二行", "utf16le"),
    ]),
    "preview.pdf": pdfFixture(),
    "broken.docx": new TextEncoder().encode("this is not a Word file"),
  };
}

function pdfFixture(): Uint8Array {
  const stream = (text: string) => `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 560] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>",
    stream("0.15 0.35 0.7 rg 30 450 340 70 re f BT /F1 20 Tf 40 400 Td (PDF preview page 1) Tj ET"),
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 560] /Resources << /Font << /F1 7 0 R /F2 8 0 R >> >> /Contents 6 0 R >>",
    stream(
      "0.2 0.6 0.3 rg 30 450 340 70 re f BT /F1 20 Tf 40 400 Td (PDF preview page 2) Tj ET BT /F2 20 Tf 40 350 Td <4E2D6587> Tj ET",
    ),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [9 0 R] >>",
    "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor 10 0 R /DW 1000 >>",
    "<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>",
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(text.length);
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) text += `${String(offset).padStart(10, "0")} 00000 n \n`;
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(text);
}
