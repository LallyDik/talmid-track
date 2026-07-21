/**
 * Report export service — "ניהול הישיבה".
 *
 * A single, generic document descriptor (column / row) that every report in
 * src/components/reports builds, plus three exporters:
 *
 *   - exportToExcel(): real .xlsx download via the `xlsx` package (RTL sheet
 *     view, Hebrew headers, sensible column widths, dated filename).
 *   - exportToPDF():   Hebrew + RTL PDF via the browser's own print engine
 *     ("שמירה כ-PDF"). See the note below for why we do NOT use jsPDF here.
 *   - printReport():   the same self-contained, print-optimised HTML document
 *     sent straight to the printer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  WHY NOT jsPDF + jspdf-autotable FOR HEBREW?
 * ─────────────────────────────────────────────────────────────────────────
 *  jsPDF's built-in fonts (Helvetica/Times/Courier) contain ZERO Hebrew
 *  glyphs, so Hebrew renders as tofu/□□□. Even after embedding a Hebrew TTF,
 *  jsPDF has no bidi/RTL text shaping — logical-order strings are drawn
 *  left-to-right, so Hebrew (and mixed Hebrew/number) text comes out visually
 *  reversed and words break apart. jspdf-autotable inherits the same problem.
 *  Producing correct, non-garbled Hebrew that way is not reliably achievable.
 *
 *  Per the task's explicit guidance ("if you cannot make Hebrew render
 *  correctly, fall back to a print-to-PDF approach rather than shipping
 *  mojibake"), exportToPDF() renders a styled, self-contained HTML document
 *  and hands it to the browser's print pipeline, where the OS text stack does
 *  full Hebrew shaping + RTL correctly. The user picks "Save as PDF" /
 *  "שמירה כ-PDF" as the print destination. This guarantees perfect Hebrew.
 */

import * as XLSX from "xlsx";
import { formatHebrewDateTime } from "@/lib/hebrew";

/* ------------------------------------------------------------------ *
 * Document descriptor — generic over a column / row shape.
 * ------------------------------------------------------------------ */

export interface ExportColumn {
  /** Object key used to read the value out of each row. */
  key: string;
  /** Hebrew column header. */
  header: string;
  /** Excel column width, in characters. */
  width?: number;
  /** Text alignment for the print/PDF table. */
  align?: "right" | "left" | "center";
}

/** A row is a plain map of column-key → already-formatted display value. */
export type ExportRow = Record<string, string | number | null | undefined>;

export interface ExportSection {
  /** Optional Hebrew section heading (also becomes the Excel sheet name). */
  title?: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  /** Force a page break before this section in the printed/PDF output. */
  pageBreakBefore?: boolean;
  /** Optional free text shown under the section heading (print/PDF only). */
  note?: string;
}

export interface ReportDocument {
  /** Report title, e.g. "דוח נוכחות יומי". */
  reportTitle: string;
  /** Yeshiva name for the printed header. */
  yeshivaName?: string;
  /** Context line, e.g. the selected date / range / student. */
  subtitle?: string;
  /** Generation timestamp (defaults to now). */
  generatedAt?: Date;
  sections: ExportSection[];
  /** Filename stem (without extension). Defaults to the report title. */
  fileBaseName?: string;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Make a safe, human filename stem (Hebrew is preserved). */
function safeFileStem(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function cellText(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hasAnyRows(doc: ReportDocument): boolean {
  return doc.sections.some((s) => s.rows.length > 0);
}

/* ------------------------------------------------------------------ *
 * 1) Excel
 * ------------------------------------------------------------------ */

function uniqueSheetName(raw: string | undefined, used: Set<string>): string {
  const base =
    (raw ?? "גיליון").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 28) || "גיליון";
  let name = base;
  let i = 1;
  while (used.has(name)) {
    i += 1;
    const suffix = ` ${i}`;
    name = (base.slice(0, 31 - suffix.length) + suffix).trim();
  }
  used.add(name);
  return name;
}

/**
 * Build & download an .xlsx workbook. One worksheet per section (the report
 * title + context are placed as a banner above the header row of each sheet).
 */
export function exportToExcel(doc: ReportDocument): void {
  const wb = XLSX.utils.book_new();
  // Right-to-left view for the whole workbook.
  wb.Workbook = { Views: [{ RTL: true }] };

  const generatedAt = doc.generatedAt ?? new Date();
  const bannerLine1 = [doc.yeshivaName, doc.reportTitle].filter(Boolean).join(" — ");
  const bannerLine2 = [doc.subtitle, `הופק: ${formatHebrewDateTime(generatedAt)}`]
    .filter(Boolean)
    .join("  ·  ");

  const used = new Set<string>();
  const sections = doc.sections.length > 0 ? doc.sections : [{ title: undefined, columns: [], rows: [] }];

  sections.forEach((section) => {
    const headers = section.columns.map((c) => c.header);
    const aoa: (string | number)[][] = [];
    aoa.push([bannerLine1]);
    if (bannerLine2) aoa.push([bannerLine2]);
    if (section.title) aoa.push([section.title]);
    aoa.push([]); // spacer
    const headerRowIndex = aoa.length;
    aoa.push(headers);
    for (const row of section.rows) {
      aoa.push(
        section.columns.map((c) => {
          const v = row[c.key];
          return v === null || v === undefined ? "" : v;
        }),
      );
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Column widths.
    ws["!cols"] = section.columns.map((c) => ({ wch: c.width ?? 16 }));

    // Merge the banner rows across all columns for a clean title band.
    const lastCol = Math.max(0, section.columns.length - 1);
    const merges: XLSX.Range[] = [];
    let bannerRows = 1 + (bannerLine2 ? 1 : 0) + (section.title ? 1 : 0);
    for (let r = 0; r < bannerRows; r += 1) {
      merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
    }
    ws["!merges"] = merges;

    // Freeze the header row so it stays visible while scrolling.
    ws["!freeze"] = { xSplit: 0, ySplit: headerRowIndex + 1 } as unknown as XLSX.WorkSheet["!freeze"];

    XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(section.title ?? doc.reportTitle, used));
  });

  const stem = safeFileStem(doc.fileBaseName ?? doc.reportTitle);
  XLSX.writeFile(wb, `${stem} ${isoDate(generatedAt)}.xlsx`, { compression: true });
}

/* ------------------------------------------------------------------ *
 * 2 + 3) Print-optimised HTML document (shared by PDF + Print)
 * ------------------------------------------------------------------ */

const alignToCss: Record<NonNullable<ExportColumn["align"]>, string> = {
  right: "right",
  left: "left",
  center: "center",
};

function buildReportHTML(doc: ReportDocument): string {
  const generatedAt = doc.generatedAt ?? new Date();

  const sectionsHtml = doc.sections
    .map((section) => {
      const head = section.columns
        .map(
          (c) =>
            `<th style="text-align:${alignToCss[c.align ?? "right"]}">${esc(c.header)}</th>`,
        )
        .join("");

      const body =
        section.rows.length === 0
          ? `<tr><td class="empty" colspan="${Math.max(1, section.columns.length)}">אין נתונים להצגה</td></tr>`
          : section.rows
              .map(
                (row) =>
                  `<tr>${section.columns
                    .map(
                      (c) =>
                        `<td style="text-align:${alignToCss[c.align ?? "right"]}">${esc(
                          cellText(row[c.key]),
                        )}</td>`,
                    )
                    .join("")}</tr>`,
              )
              .join("");

      return `
        <section${section.pageBreakBefore ? ' class="break-before"' : ""}>
          ${section.title ? `<h2>${esc(section.title)}</h2>` : ""}
          ${section.note ? `<p class="section-note">${esc(section.note)}</p>` : ""}
          <table>
            <thead><tr>${head}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${esc(doc.reportTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap" />
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Heebo", "Arial Hebrew", "David", system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #000; background: #fff; direction: rtl; padding: 20px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .doc-header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
  .doc-header .yeshiva { font-size: 13px; font-weight: 600; color: #333; letter-spacing: .2px; }
  .doc-header h1 { font-size: 22px; margin: 3px 0 2px; font-weight: 700; }
  .doc-header .subtitle { font-size: 13px; color: #333; }
  .doc-header .meta { font-size: 11px; color: #666; margin-top: 4px; }
  section { margin-top: 16px; }
  section.break-before { page-break-before: always; }
  h2 {
    font-size: 15px; margin: 0 0 8px; font-weight: 700;
    border-inline-start: 4px solid #111; padding-inline-start: 8px;
  }
  .section-note { font-size: 12px; color: #555; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th, td { border: 1px solid #999; padding: 5px 7px; vertical-align: middle; }
  thead th { background: #ececec; font-weight: 700; }
  tbody tr:nth-child(even) td { background: #f6f6f6; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  .empty { text-align: center; color: #666; font-style: italic; padding: 14px; }
  .print-hint {
    margin-bottom: 14px; padding: 8px 12px; border: 1px dashed #bbb; border-radius: 8px;
    font-size: 12px; color: #444; background: #fafafa;
  }
  @media print { body { padding: 0; } .print-hint { display: none; } }
</style>
</head>
<body>
  <div class="print-hint">לשמירה כקובץ PDF בחרו "שמירה כ-PDF" / "Save as PDF" ביעד ההדפסה.</div>
  <div class="doc-header">
    ${doc.yeshivaName ? `<div class="yeshiva">${esc(doc.yeshivaName)}</div>` : ""}
    <h1>${esc(doc.reportTitle)}</h1>
    ${doc.subtitle ? `<div class="subtitle">${esc(doc.subtitle)}</div>` : ""}
    <div class="meta">הופק בתאריך ${esc(formatHebrewDateTime(generatedAt))}</div>
  </div>
  ${sectionsHtml}
</body>
</html>`;
}

/**
 * Render `html` into a hidden iframe and trigger the browser print dialog.
 * Cleans the iframe up afterwards.
 */
function printHtmlDocument(html: string): void {
  if (typeof document === "undefined") {
    throw new Error("print is only available in the browser");
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  document.body.appendChild(iframe);

  const idoc = iframe.contentWindow?.document;
  if (!idoc || !iframe.contentWindow) {
    iframe.remove();
    throw new Error("could not open a print document");
  }

  const win = iframe.contentWindow;
  let done = false;
  const cleanup = () => {
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1500);
  };
  const doPrint = () => {
    if (done) return;
    done = true;
    try {
      win.focus();
      win.print();
    } finally {
      cleanup();
    }
  };

  idoc.open();
  idoc.write(html);
  idoc.close();

  // Give the (webfont-bearing) document a moment to lay out before printing.
  if (idoc.readyState === "complete") {
    window.setTimeout(doPrint, 350);
  } else {
    win.onload = () => window.setTimeout(doPrint, 350);
    // Safety fallback in case onload never fires.
    window.setTimeout(doPrint, 1200);
  }
}

/**
 * "Export to PDF": renders the report as a print-optimised HTML document and
 * opens the browser print dialog, where the user chooses "Save as PDF".
 * See the file header for why this beats jsPDF for Hebrew/RTL.
 */
export function exportToPDF(doc: ReportDocument): void {
  printHtmlDocument(buildReportHTML(doc));
}

/**
 * "Print": identical rendering pipeline, sent to the printer.
 */
export function printReport(doc: ReportDocument): void {
  printHtmlDocument(buildReportHTML(doc));
}

export { hasAnyRows };
