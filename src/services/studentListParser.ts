/**
 * Student List Parser
 * שכבת שירות נטולת-UI לניתוח רשימות בחורים מקבצים / טקסט מודבק.
 *
 * המבנה מכוון לבדיקה (testable) והפרדה מלאה מהמסך: כל פונקציה מקבלת נתונים
 * ומחזירה נתונים, בלי React ובלי גישה ל-DB.
 *
 * קבצים בינאריים שאינם טבלה (‎.doc/.docx/.pdf/תמונות) מנותבים דרך "תפר"
 * (‎documentTextExtractor) שכרגע זורק שגיאה בעברית "עדיין לא נתמך" — בדיוק
 * במבנה של attendanceDocumentProcessor, כדי שאפשר יהיה להחליף אותו בעתיד
 * במנוע OCR/AI אמיתי בלי לשנות את שאר המערכת. איננו "מזייפים" ייבוא ריק.
 */

import * as XLSX from "xlsx";
import Papa from "papaparse";

/* ================================================================== *
 * Types
 * ================================================================== */

/** מקור הנתונים שממנו נותחה הרשימה. */
export type SourceType = "xlsx" | "csv" | "paste";

/** ששת שדות היעד שאליהם ממפים עמודות. */
export type TargetField =
  | "full_name"
  | "father_name"
  | "class_name"
  | "phone"
  | "parent_phone"
  | "notes";

/** מיפוי שדה-יעד ← אינדקס העמודה במקור (‎null = לא ממופה). */
export type ColumnMapping = Record<TargetField, number | null>;

/** שורה מנורמלת לפי המיפוי — כל הערכים מחרוזות מנוקות. */
export type NormalizedRow = Record<TargetField, string>;

export interface ParsedSheet {
  /** שמות העמודות (כותרות אמיתיות או כותרות סינתטיות "עמודה N"). */
  headers: string[];
  /** שורות הנתונים (ללא שורת הכותרת אם זוהתה כזו). */
  rows: string[][];
  sourceType: SourceType;
  /** האם שורה 0 המקורית זוהתה ככותרת. */
  hasHeader: boolean;
  /** אזהרות לא-חוסמות שנאספו בזמן הניתוח (קידוד, גיליון ריק וכו'). */
  warnings: string[];
}

/** בחור קיים במערכת — לצורך זיהוי כפילויות. */
export interface ExistingStudent {
  id: string;
  full_name: string;
  father_name: string | null;
  class_name: string | null;
}

export type DuplicateType = "exact" | "near" | "internal";

export interface DuplicateMatch {
  /** אינדקס השורה הנכנסת (‎rows) שזוהתה ככפילות. */
  index: number;
  type: DuplicateType;
  /** מזהה הבחור הקיים במערכת (רק כאשר יש התאמה למאגר). */
  matchedExistingId?: string;
  /** תיאור המועמד הקיים / מקור הכפילות, להצגה למשתמש. */
  matchedLabel: string;
}

export const TARGET_FIELDS: TargetField[] = [
  "full_name",
  "father_name",
  "class_name",
  "phone",
  "parent_phone",
  "notes",
];

/** תוויות עבריות לשדות היעד (לשימוש ב-UI). */
export const targetFieldLabels: Record<TargetField, string> = {
  full_name: "שם מלא",
  father_name: "שם האב",
  class_name: "שיעור",
  phone: "טלפון",
  parent_phone: "טלפון הורים",
  notes: "הערות",
};

/* ================================================================== *
 * Document text-extraction seam (mirrors attendanceDocumentProcessor)
 * ------------------------------------------------------------------
 * מימוש נוכחי: זורק שגיאה ברורה בעברית. אין OCR/AI מובנה — עדיף לומר
 * את האמת למשתמש מאשר לייבא רשומות ריקות בשקט. ניתן להחליף את המימוש
 * בלי לגעת בשאר הקובץ.
 * ================================================================== */

export interface TextExtractor {
  /** מחזיר טקסט גולמי מתוך קובץ מסמך/תמונה, או זורק אם אינו נתמך. */
  extractText(file: File): Promise<string>;
}

class UnsupportedTextExtractor implements TextExtractor {
  async extractText(file: File): Promise<string> {
    throw new Error(
      `הקובץ "${file.name}" הוא מסוג שעדיין לא נתמך לייבוא אוטומטי. ` +
        `כדי לייבא ממנו רשימת בחורים יש להמיר אותו לקובץ Excel ‎(.xlsx)‎ או ‎CSV, ` +
        `או להעתיק את הטבלה ולהדביק אותה בלשונית "הדבקת טקסט".`,
    );
  }
}

/**
 * נקודת ההזרקה היחידה למנוע חילוץ טקסט ממסמכים. בעתיד אפשר להחליף את
 * המופע הזה במימוש אמיתי (OCR / מודל AI) בלי לשנות את parseFile.
 */
export const documentTextExtractor: TextExtractor = new UnsupportedTextExtractor();

/* ================================================================== *
 * File-type detection
 * ================================================================== */

type Kind = "spreadsheet" | "delimited" | "document" | "unknown";

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function classifyFile(file: File): Kind {
  const ext = extensionOf(file.name);
  if (["xlsx", "xls", "xlsm", "xlsb", "ods"].includes(ext)) return "spreadsheet";
  if (["csv", "tsv", "txt"].includes(ext)) return "delimited";
  if (
    [
      "doc",
      "docx",
      "pdf",
      "rtf",
      "pages",
      "png",
      "jpg",
      "jpeg",
      "gif",
      "webp",
      "heic",
      "heif",
      "bmp",
      "tiff",
    ].includes(ext)
  ) {
    return "document";
  }

  // Fall back to MIME sniffing when the extension is missing/unknown.
  const mime = (file.type || "").toLowerCase();
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "spreadsheet";
  if (mime.includes("csv") || mime === "text/plain" || mime.includes("tab-separated")) {
    return "delimited";
  }
  if (mime.startsWith("image/") || mime.includes("pdf") || mime.includes("word")) {
    return "document";
  }
  return "unknown";
}

/* ================================================================== *
 * Text decoding (UTF-8 with BOM + Hebrew windows-1255 fallback)
 * ================================================================== */

function decodeBuffer(buffer: ArrayBuffer): { text: string; warning?: string } {
  const bytes = new Uint8Array(buffer);

  // Strip UTF-8 BOM if present.
  let start = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    start = 3;
  }
  const body = start ? bytes.subarray(start) : bytes;

  const utf8 = new TextDecoder("utf-8").decode(body);
  // A replacement character usually means the file is not valid UTF-8 —
  // Hebrew exports from older software are often windows-1255 encoded.
  if (utf8.includes("�")) {
    try {
      const legacy = new TextDecoder("windows-1255").decode(body);
      if (!legacy.includes("�")) {
        return {
          text: legacy,
          warning: "הקובץ פוענח כקידוד עברי ישן (windows-1255). מומלץ לוודא שהשמות נקראים כראוי.",
        };
      }
    } catch {
      // windows-1255 not supported in this runtime — keep the UTF-8 result.
    }
  }
  return { text: utf8 };
}

async function readFileText(file: File): Promise<{ text: string; warning?: string }> {
  const buffer = await file.arrayBuffer();
  return decodeBuffer(buffer);
}

/* ================================================================== *
 * Matrix helpers
 * ================================================================== */

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** Drops trailing empty columns and fully-empty rows from a raw matrix. */
function cleanMatrix(matrix: unknown[][]): string[][] {
  const rows = matrix
    .map((row) => (Array.isArray(row) ? row.map(cellToString) : []))
    .filter((row) => row.some((cell) => cell !== ""));

  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  // Pad every row to the same width so column indexes are stable.
  return rows.map((row) => {
    const padded = row.slice(0, width);
    while (padded.length < width) padded.push("");
    return padded;
  });
}

/* ================================================================== *
 * Header detection + column guessing
 * ================================================================== */

/** מסיר גרש/גרשיים/מרכאות/ניקוד ומצמצם רווחים — למפתח השוואה. */
function normalizeHeaderKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "") // Hebrew niqqud / cantillation
    .replace(/[׳״'"`´.:*\-_/\\()]/g, "") // geresh, gershayim, quotes, punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * מילון כינויים לכל שדה יעד (עברית + אנגלית). הסדר בתוך המערך אינו קריטי;
 * הדירוג נעשה לפי איכות ההתאמה (מדויקת מול הכלה).
 */
const HEADER_ALIASES: Record<TargetField, string[]> = {
  full_name: [
    "שם מלא",
    "שם הבחור",
    "שם התלמיד",
    "שם תלמיד",
    "שם הבן",
    "שם פרטי ומשפחה",
    "שם",
    "name",
    "full name",
    "student",
    "student name",
    "fullname",
  ],
  father_name: ["שם האב", "שם אב", "שם ההורה", "אב", "father", "father name", "fathername"],
  class_name: [
    "שיעור",
    "השיעור",
    "כיתה",
    "מחזור",
    "קבוצה",
    "class",
    "grade",
    "group",
    "shiur",
  ],
  phone: [
    "טלפון",
    "נייד",
    "פלאפון",
    "טלפון הבחור",
    "טלפון נייד",
    "מספר טלפון",
    "phone",
    "mobile",
    "cell",
    "tel",
    "telephone",
  ],
  parent_phone: [
    "טלפון הורים",
    "טלפון הורה",
    "נייד הורים",
    "טלפון ההורים",
    "הורים",
    "טלפון אבא",
    "טלפון אמא",
    "parent",
    "parents",
    "parent phone",
    "guardian",
    "guardian phone",
  ],
  notes: ["הערות", "הערה", "notes", "note", "comment", "comments", "remarks"],
};

/**
 * מנקד עמודה מול שדה יעד:
 *  100 — התאמה מדויקת, 60 — הכותרת מכילה כינוי, 40 — כינוי מכיל את הכותרת.
 * מחזיר 0 כשאין קשר.
 */
function scoreHeaderAgainstField(headerKey: string, field: TargetField): number {
  if (!headerKey) return 0;
  let best = 0;
  for (const alias of HEADER_ALIASES[field]) {
    const aliasKey = normalizeHeaderKey(alias);
    if (!aliasKey) continue;
    if (headerKey === aliasKey) {
      best = Math.max(best, 100 + aliasKey.length); // longer exact alias wins ties
    } else if (headerKey.includes(aliasKey)) {
      best = Math.max(best, 60 + aliasKey.length);
    } else if (aliasKey.includes(headerKey) && headerKey.length >= 2) {
      best = Math.max(best, 40 + headerKey.length);
    }
  }
  return best;
}

/** האם התא נראה כמו מספר/טלפון (ולכן כנראה נתון ולא כותרת). */
function looksNumeric(cell: string): boolean {
  const t = cell.trim();
  if (!t) return false;
  return /\d/.test(t) && /^[+()\-.\s\d]+$/.test(t);
}

/**
 * זיהוי אם השורה הראשונה היא כותרת. יוריסטיקה:
 *  - התאמה של תא כלשהו לכינוי כותרת ידוע → כותרת.
 *  - אחרת, אם יש יותר מעמודה אחת, כל התאים אינם מספריים, ולפחות בשורת
 *    הנתונים הבאה יש תא מספרי (טלפון) שאין בשורה הראשונה → כותרת.
 */
function detectHeader(matrix: string[][]): boolean {
  if (matrix.length === 0) return false;
  const first = matrix[0];

  const aliasMatches = first.filter((cell) => {
    const key = normalizeHeaderKey(cell);
    return TARGET_FIELDS.some((f) => scoreHeaderAgainstField(key, f) >= 100);
  }).length;
  if (aliasMatches >= 1) return true;

  if (first.length >= 2 && matrix.length >= 2) {
    const firstHasNumeric = first.some(looksNumeric);
    const secondHasNumeric = matrix[1].some(looksNumeric);
    const firstAllNonEmpty = first.every((c) => c.trim() !== "");
    if (!firstHasNumeric && secondHasNumeric && firstAllNonEmpty) return true;
  }
  return false;
}

function syntheticHeaders(width: number): string[] {
  return Array.from({ length: width }, (_, i) => `עמודה ${i + 1}`);
}

/**
 * בונה ParsedSheet ממטריצה גולמית, עם/בלי כותרת. חשוף כדי שה-UI יוכל
 * לבנות מחדש כאשר המשתמש מסמן/מבטל ידנית "השורה הראשונה היא כותרת".
 */
export function buildSheet(
  matrix: string[][],
  hasHeader: boolean,
  sourceType: SourceType,
  warnings: string[] = [],
): ParsedSheet {
  const clean = cleanMatrix(matrix);
  const width = clean.reduce((max, row) => Math.max(max, row.length), 0);

  if (clean.length === 0) {
    return { headers: [], rows: [], sourceType, hasHeader: false, warnings };
  }

  if (hasHeader) {
    const [headerRow, ...rest] = clean;
    const headers = headerRow.map((h, i) => (h.trim() ? h.trim() : `עמודה ${i + 1}`));
    return { headers, rows: rest, sourceType, hasHeader: true, warnings };
  }

  return { headers: syntheticHeaders(width), rows: clean, sourceType, hasHeader: false, warnings };
}

/**
 * מחזיר Sheet חדש עם/בלי כותרת מבלי לאבד נתונים — שימושי כשהמשתמש מחליף
 * ידנית את בחירת הכותרת. משחזר את המטריצה המלאה מתוך ה-Sheet הקיים.
 */
export function reinterpretHeader(sheet: ParsedSheet, hasHeader: boolean): ParsedSheet {
  const dataMatrix = sheet.hasHeader ? [sheet.headers, ...sheet.rows] : sheet.rows;
  return buildSheet(dataMatrix, hasHeader, sheet.sourceType, sheet.warnings);
}

/**
 * ניחוש מיפוי עמודות: מתאים כותרות (עברית ואנגלית) לששת שדות היעד בשיטת
 * fuzzy. משבץ באופן חמדני לפי הציון הגבוה ביותר ומונע שיבוץ עמודה אחת
 * לשני שדות.
 */
export function guessColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    full_name: null,
    father_name: null,
    class_name: null,
    phone: null,
    parent_phone: null,
    notes: null,
  };

  const headerKeys = headers.map(normalizeHeaderKey);

  // ציון לכל צירוף (שדה, עמודה).
  const candidates: { field: TargetField; col: number; score: number }[] = [];
  for (const field of TARGET_FIELDS) {
    headerKeys.forEach((key, col) => {
      const score = scoreHeaderAgainstField(key, field);
      if (score > 0) candidates.push({ field, col, score });
    });
  }
  candidates.sort((a, b) => b.score - a.score);

  const usedCols = new Set<number>();
  const usedFields = new Set<TargetField>();
  for (const { field, col, score } of candidates) {
    if (score <= 0) continue;
    if (usedCols.has(col) || usedFields.has(field)) continue;
    mapping[field] = col;
    usedCols.add(col);
    usedFields.add(field);
  }

  return mapping;
}

/* ================================================================== *
 * Value normalization
 * ================================================================== */

const HEBREW_DIGITS: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

/** מנרמל טקסט עברי: מצמצם רווחים ומאחד גרש/גרשיים לצורה סטנדרטית. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/[`´'‘’]/g, "׳") // apostrophe variants → geresh
    .replace(/[“”"]/g, "״") // quote variants → gershayim
    .trim();
}

/** מנרמל טלפון: ספרות אסקי בלבד, שומר על + מוביל, מסיר מפרידים. */
export function normalizePhone(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  s = s.replace(/[٠-٩]/g, (d) => HEBREW_DIGITS[d] ?? d);
  const hasPlus = s.trimStart().startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  return hasPlus ? `+${digits}` : digits;
}

function valueAt(row: string[], col: number | null): string {
  if (col === null || col < 0 || col >= row.length) return "";
  return row[col] ?? "";
}

/** מנרמל שורות גולמיות לפי המיפוי — trim, נורמליזציית עברית וטלפונים. */
export function normalizeRows(rows: string[][], mapping: ColumnMapping): NormalizedRow[] {
  return rows.map((row) => ({
    full_name: normalizeText(valueAt(row, mapping.full_name)),
    father_name: normalizeText(valueAt(row, mapping.father_name)),
    class_name: normalizeText(valueAt(row, mapping.class_name)),
    phone: normalizePhone(valueAt(row, mapping.phone)),
    parent_phone: normalizePhone(valueAt(row, mapping.parent_phone)),
    notes: normalizeText(valueAt(row, mapping.notes)),
  }));
}

/* ================================================================== *
 * Duplicate detection
 * ================================================================== */

/** מפתח השוואה "רך" לשם — ללא גרש/גרשיים/רווחים כפולים, לאיתור כפילות קרובה. */
function comparisonKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/[׳״'"`´]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function strongKey(fullName: string, fatherName: string, className: string): string {
  return [comparisonKey(fullName), comparisonKey(fatherName), comparisonKey(className)].join("|");
}

/**
 * זיהוי כפילויות: הדרישה היא dedup על שם מלא + שם האב + שיעור.
 * מחזיר גם כפילויות מדויקות (‎exact) וגם קרובות (‎near — אותו שם אך אב/שיעור
 * שונים או חסרים), וגם כפילויות פנימיות בתוך הקובץ עצמו (‎internal),
 * כדי שה-UI יוכל לבקש אישור מפורש. "אין ליצור בחור כפול ללא אישור מפורש."
 */
export function findDuplicates(
  incoming: NormalizedRow[],
  existing: ExistingStudent[],
): DuplicateMatch[] {
  const existingStrong = new Map<string, ExistingStudent>();
  const existingByName = new Map<string, ExistingStudent[]>();
  for (const s of existing) {
    const sk = strongKey(s.full_name, s.father_name ?? "", s.class_name ?? "");
    if (!existingStrong.has(sk)) existingStrong.set(sk, s);
    const nk = comparisonKey(s.full_name);
    if (nk) {
      const list = existingByName.get(nk) ?? [];
      list.push(s);
      existingByName.set(nk, list);
    }
  }

  const describe = (s: ExistingStudent): string => {
    const parts = [s.full_name];
    if (s.father_name) parts.push(`בן ${s.father_name}`);
    if (s.class_name) parts.push(`(${s.class_name})`);
    return parts.join(" ");
  };

  const results: DuplicateMatch[] = [];
  const seenStrong = new Map<string, number>(); // strongKey → first incoming index

  incoming.forEach((row, index) => {
    const name = comparisonKey(row.full_name);
    if (!name) return; // rows without a name are handled as errors, not duplicates

    const sk = strongKey(row.full_name, row.father_name, row.class_name);

    // 1) Exact match against the DB.
    const exact = existingStrong.get(sk);
    if (exact) {
      results.push({
        index,
        type: "exact",
        matchedExistingId: exact.id,
        matchedLabel: describe(exact),
      });
      seenStrong.set(sk, index);
      return;
    }

    // 2) Duplicate within the incoming file itself.
    if (seenStrong.has(sk)) {
      results.push({
        index,
        type: "internal",
        matchedLabel: `שורה ${seenStrong.get(sk)! + 1} בקובץ`,
      });
      return;
    }
    seenStrong.set(sk, index);

    // 3) Near match: same name in the DB but father/class differ or are missing.
    const byName = existingByName.get(name);
    if (byName && byName.length > 0) {
      results.push({
        index,
        type: "near",
        matchedExistingId: byName[0].id,
        matchedLabel: describe(byName[0]),
      });
    }
  });

  return results;
}

/* ================================================================== *
 * Entry points
 * ================================================================== */

async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const warnings: string[] = [];

  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { headers: [], rows: [], sourceType: "xlsx", hasHeader: false, warnings: ["הקובץ אינו מכיל גיליונות."] };
  }
  if (wb.SheetNames.length > 1) {
    warnings.push(`הקובץ מכיל ${wb.SheetNames.length} גיליונות. יובא הגיליון הראשון בלבד: "${sheetName}".`);
  }

  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });

  const clean = cleanMatrix(matrix);
  if (clean.length === 0) {
    return { headers: [], rows: [], sourceType: "xlsx", hasHeader: false, warnings: [...warnings, "הגיליון ריק."] };
  }
  return buildSheet(clean, detectHeader(clean), "xlsx", warnings);
}

function parseDelimitedText(text: string, sourceType: SourceType, warnings: string[]): ParsedSheet {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
    // אין header:true — אנחנו מזהים כותרת בעצמנו ומחזירים מטריצה גולמית.
  });

  const rawWarnings = [...warnings];
  if (result.errors?.length) {
    const first = result.errors[0];
    rawWarnings.push(`אזהרת ניתוח בשורה ${(first.row ?? 0) + 1}: ${first.message}`);
  }

  const clean = cleanMatrix(result.data as unknown[][]);
  if (clean.length === 0) {
    return { headers: [], rows: [], sourceType, hasHeader: false, warnings: [...rawWarnings, "לא נמצאו שורות."] };
  }
  return buildSheet(clean, detectHeader(clean), sourceType, rawWarnings);
}

/**
 * ניתוח קובץ שהעלה המשתמש. תומך ב-Excel (‎.xlsx/.xls) ו-CSV/TSV (עם BOM
 * וקידוד עברי). קבצי מסמך/תמונה מנותבים דרך documentTextExtractor שזורק
 * שגיאה ברורה "עדיין לא נתמך" — לא מייבאים בשקט שום דבר.
 */
export async function parseFile(file: File): Promise<ParsedSheet> {
  const kind = classifyFile(file);

  switch (kind) {
    case "spreadsheet":
      return parseSpreadsheet(file);

    case "delimited": {
      const { text, warning } = await readFileText(file);
      return parseDelimitedText(text, "csv", warning ? [warning] : []);
    }

    case "document":
      // זורק שגיאה עברית ברורה — התפר להחלפה עתידית ב-OCR/AI.
      await documentTextExtractor.extractText(file);
      // אם בעתיד extractText יחזיר טקסט מובנה, ננתח אותו כאן.
      throw new Error("חילוץ טקסט ממסמך עדיין לא נתמך.");

    default:
      throw new Error(
        `סוג הקובץ "${file.name}" אינו נתמך לייבוא. יש להעלות קובץ Excel ‎(.xlsx)‎ או ‎CSV, ` +
          `או להשתמש בלשונית "הדבקת טקסט".`,
      );
  }
}

/**
 * ניתוח טקסט מודבק (מ-Excel/Word/וכו'). מזהה מפריד (טאב/פסיק) אוטומטית
 * דרך papaparse, ומחזיר ParsedSheet זהה במבנהו לזה של parseFile.
 */
export function parsePastedText(text: string): ParsedSheet {
  const trimmed = text.replace(/^﻿/, "");
  if (!trimmed.trim()) {
    return { headers: [], rows: [], sourceType: "paste", hasHeader: false, warnings: ["לא הודבק טקסט."] };
  }
  return parseDelimitedText(trimmed, "paste", []);
}
