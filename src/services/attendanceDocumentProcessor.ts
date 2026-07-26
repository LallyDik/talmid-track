/**
 * Attendance Document Processor
 * -----------------------------------------------------------------------------
 * שכבת שירות מנותקת (swappable) לזיהוי סימוני נוכחות ממסמכים סרוקים.
 *
 * העיצוב: ה-UI מדבר אך ורק מול הממשק `AttendanceDocumentProcessor` ומול ה-singleton
 * `attendanceDocumentProcessor`. אפשר להחליף את המימוש (MOCK → OCR/AI אמיתי) בלי
 * לגעת באף מסך. בחירת המימוש נעשית לפי משתנה סביבה בזמן build:
 *
 *   VITE_ATTENDANCE_PROCESSOR_MODE = "mock" (ברירת מחדל) | "http" | "anthropic" | "tesseract"
 *   VITE_ATTENDANCE_OCR_ENDPOINT   = כתובת שירות ה-OCR/AI (נדרש כאשר MODE=http)
 *
 * מצבים:
 *   • "mock" (ברירת מחדל) — MockProcessor דטרמיניסטי-למחצה להדגמות/בדיקות.
 *   • "http" / "real"      — HttpProcessor: שירות OCR/AI חיצוני בקריאת HTTP אחת.
 *   • "anthropic" / "vision" — AnthropicVisionProcessor: זיהוי אמיתי בכתב-יד עברי
 *     על בסיס Claude Vision. הקובץ הסרוק מומר בצד-הלקוח לתמונות-עמודות (רסטריזציה
 *     של PDF/תמונה + חיתוך אנכי לעמודות), ונשלח ל-Supabase Edge Function
 *     "detect-attendance" שקורא ל-Claude. דורש:
 *        1) פריסת הפונקציה supabase/functions/detect-attendance (Lovable פורס אוטומטית).
 *        2) הגדרת הסוד ANTHROPIC_API_KEY ב-Supabase/Lovable.
 *        3) (אופציונלי) ATTENDANCE_VISION_MODEL לבחירת מודל (ברירת מחדל claude-opus-4-8).
 *   • "tesseract" / "ocr" — TesseractOcrProcessor: OCR חינמי 100% בצד-הלקוח מבוסס
 *     Tesseract.js (מנוע Tesseract בעברית, "heb"). נבנה כדי לבדוק אם מנוע-OCR ייעודי
 *     קורא את *השמות המודפסים* טוב יותר מ-Claude Vision. הזרימה: רסטריזציה של הקובץ
 *     לתמונות-עמודות בגובה מלא (ללא חיתוך לרצועות-שורות — Tesseract קורא בלוק רב-שורות
 *     בעצמו), הרצת OCR על כל עמודה, חילוץ טקסט + bounding-box לכל שורה, התאמת כל שורה
 *     לרשימת הבחורים, וזיהוי-סימון היוריסטי לפי כהות-פיקסלים באזור התאים משמאל לשם.
 *     אין קריאה לשום API בתשלום. הערת רשת (NetFree): קובץ נתוני-השפה העברית
 *     (heb.traineddata) וליבת ה-WASM נטענים כברירת מחדל מ-CDN (jsdelivr) בזמן ריצה;
 *     אם ה-CDN חסום יש להצביע על עותק מקומי דרך VITE_TESSERACT_LANG_PATH /
 *     VITE_TESSERACT_CORE_PATH. קובץ ה-worker נטען מקומית מתוך החבילה (ללא CDN).
 *
 * המימוש MockProcessor הוא דטרמיניסטי-למחצה: אותו קובץ + אותו בחור מחזירים תמיד את
 * אותה תוצאה, כך שבדיקות והדגמות יציבות. הוא מחזיר גם מטא-דאטה של מיקום (bounding box)
 * לכל בחור תחת `raw`, לשימוש עתידי בהדגשת הסימון על גבי הסריקה.
 * -----------------------------------------------------------------------------
 */

import type { AttendanceStatus } from "@/lib/hebrew";
import { supabase } from "@/integrations/supabase/client";

/** סף רמת הוודאות שמתחתיו רשומה נחשבת "לא בטוחה" ומצריכה בדיקה ידנית. */
export const LOW_CONFIDENCE_THRESHOLD = 0.75;

export interface StudentInput {
  id: string;
  full_name: string;
}

/** הקשר הדוח — מועבר למנוע הזיהוי כדי לשפר דיוק / לבחור טמפלייט מתאים. */
export interface ProcessorContext {
  studySessionId?: string | null;
  studySessionName?: string | null;
  classId?: string | null;
  className?: string | null;
  reportDate?: string | null;
}

/** מיקום יחסי (0..1) של סימון הבחור על גבי העמוד — לצורך הדגשה עתידית. */
export interface DetectionBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionResult {
  student_id: string;
  attendance_status: AttendanceStatus;
  detection_confidence: number; // 0..1
  box?: DetectionBox;
}

export interface ProcessorInput {
  fileUrl: string;
  fileName?: string | null;
  /** הקובץ הגולמי אם הוא כבר בזיכרון (למשל מיד לאחר בחירה/העלאה). כשמסופק,
   *  מדלגים על הורדה חוזרת מ-Storage — מהיר יותר וללא כשלי רשת/CORS. */
  file?: Blob | null;
  students: StudentInput[];
  context?: ProcessorContext;
}

export interface ProcessorOutput {
  /** תוצאות רק עבור בחורים שהמנוע הצליח לקרוא עבורם סימון. בחורים ללא סימון
   *  לא יופיעו כאן — שכבת ה-ingestion מגדירה אותם כ"נעדר" (ראו resolveRoster). */
  results: DetectionResult[];
  raw: Record<string, unknown>;
}

/** הממשק היחיד שה-UI מכיר. כל מימוש (mock/http/מקומי) חייב לספק אותו. */
export interface AttendanceDocumentProcessor {
  process(input: ProcessorInput): Promise<ProcessorOutput>;
}

/* -------------------------------------------------------------------------- *
 * resolveRoster — פונקציית עזר טהורה (ללא תלות ב-DB) שממפה את רשימת הבחורים
 * המלאה + תוצאות הזיהוי לרשומות נוכחות מוכנות לכתיבה כטיוטה.
 *
 * חוקים (BUG C):
 *   - בחור שלא זוהה כלל  → "נעדר" (absent), detected_automatically=false.
 *   - בחור עם רמת ודאות מתחת לסף → נספר כ"דורש בדיקה".
 *   - אם יש ולו רשומה אחת שלא זוהתה/לא בטוחה → הדוח כולו needsReview.
 * -------------------------------------------------------------------------- */
export interface ResolvedRecord {
  student_id: string;
  attendance_status: AttendanceStatus;
  detection_confidence: number | null;
  detected_automatically: boolean;
  box: DetectionBox | null;
}

export interface ResolvedRoster {
  records: ResolvedRecord[];
  undetectedCount: number;
  lowConfidenceCount: number;
  needsReview: boolean;
}

export function resolveRoster(
  students: StudentInput[],
  detections: DetectionResult[],
  threshold: number = LOW_CONFIDENCE_THRESHOLD,
): ResolvedRoster {
  const byId = new Map(detections.map((d) => [d.student_id, d]));
  let undetectedCount = 0;
  let lowConfidenceCount = 0;

  const records: ResolvedRecord[] = students.map((s) => {
    const d = byId.get(s.id);
    if (!d) {
      undetectedCount++;
      const rec: ResolvedRecord = {
        student_id: s.id,
        attendance_status: "absent",
        detection_confidence: null,
        detected_automatically: false,
        box: null,
      };
      return rec;
    }
    if (d.detection_confidence < threshold) lowConfidenceCount++;
    const rec: ResolvedRecord = {
      student_id: s.id,
      attendance_status: d.attendance_status,
      detection_confidence: d.detection_confidence,
      detected_automatically: true,
      box: d.box ?? null,
    };
    return rec;
  });

  return {
    records,
    undetectedCount,
    lowConfidenceCount,
    needsReview: undetectedCount > 0 || lowConfidenceCount > 0,
  };
}

/* -------------------------------------------------------------------------- *
 * Deterministic pseudo-random helpers — same input ⇒ same output.
 * -------------------------------------------------------------------------- */
function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** מחזיר מספר יציב בטווח [0,1) מתוך seed. */
function unit(seed: number): number {
  let x = seed || 0x9e3779b9;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  return (x >>> 0) / 0x100000000;
}

/* -------------------------------------------------------------------------- *
 * MockProcessor — מימוש דמו דטרמיניסטי-למחצה.
 * -------------------------------------------------------------------------- */
const WEIGHTED_STATUSES: AttendanceStatus[] = [
  "on_time",
  "on_time",
  "on_time",
  "on_time",
  "late_b",
  "late_b",
  "late_c",
  "absent",
  "excused",
];
const ROWS_PER_PAGE = 22;

class MockProcessor implements AttendanceDocumentProcessor {
  async process({ fileUrl, fileName, students, context }: ProcessorInput): Promise<ProcessorOutput> {
    // הדמיית זמן עיבוד
    await new Promise((r) => setTimeout(r, 700));

    const fileSeed = hashSeed(
      `${fileUrl}|${fileName ?? ""}|${context?.studySessionId ?? ""}|${context?.classId ?? ""}`,
    );

    const results: DetectionResult[] = [];
    students.forEach((s, i) => {
      const seed = hashSeed(`${fileSeed}:${s.id}`);

      // ~7% מהרשימה חוזרים ללא סימון קריא — נשארים ל-ingestion להגדרה כ"נעדר".
      if (unit(seed) < 0.07) return;

      const status = WEIGHTED_STATUSES[Math.floor(unit(seed ^ 0x00abcdef) * WEIGHTED_STATUSES.length)]!;
      const confidence = Number((0.6 + unit(seed ^ 0x00001234) * 0.39).toFixed(2)); // 0.60..0.99

      const page = Math.floor(i / ROWS_PER_PAGE) + 1;
      const rowInPage = i % ROWS_PER_PAGE;
      results.push({
        student_id: s.id,
        attendance_status: status,
        detection_confidence: confidence,
        box: {
          page,
          x: 0.62,
          y: Number((0.06 + rowInPage * (0.9 / ROWS_PER_PAGE)).toFixed(4)),
          width: 0.3,
          height: 0.03,
        },
      });
    });

    const pageCount = Math.max(1, Math.ceil(students.length / ROWS_PER_PAGE));

    return {
      results,
      raw: {
        engine: "mock-v2",
        deterministic: true,
        processed_at: new Date().toISOString(),
        file: fileName ?? fileUrl ?? null,
        context: context ?? null,
        page_count: pageCount,
        roster: students.length,
        detected: results.length,
        // מטא-דאטה של מיקום לכל בחור שזוהה (bounding box יחסי לעמוד)
        boxes: results.map((r) => ({ student_id: r.student_id, ...r.box })),
      },
    };
  }
}

/* -------------------------------------------------------------------------- *
 * HttpProcessor — מימוש "אמיתי" לדוגמה. מדגים כיצד לחבר OCR/מודל AI חיצוני
 * דרך קריאת HTTP אחת, בלי שום שינוי ב-UI. מופעל כאשר
 * VITE_ATTENDANCE_PROCESSOR_MODE="http".
 *
 * להחלפה במנוע אמיתי משלכם — כל שנדרש הוא שהשירות יחזיר JSON בצורה:
 *   { results: DetectionResult[], raw?: Record<string, unknown> }
 * ואז הכל (טיוטה, needs_review, ברירת-מחדל נעדר, מסך האימות) ממשיך לעבוד כמו שהוא.
 * -------------------------------------------------------------------------- */
class HttpProcessor implements AttendanceDocumentProcessor {
  async process(input: ProcessorInput): Promise<ProcessorOutput> {
    const endpoint = import.meta.env.VITE_ATTENDANCE_OCR_ENDPOINT as string | undefined;
    if (!endpoint) {
      throw new Error("שירות זיהוי המסמכים אינו מוגדר (חסר VITE_ATTENDANCE_OCR_ENDPOINT).");
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileUrl: input.fileUrl,
        fileName: input.fileName ?? null,
        context: input.context ?? null,
        students: input.students,
      }),
    });

    if (!res.ok) {
      throw new Error(`שירות הזיהוי החזיר שגיאה (${res.status}).`);
    }

    const data = (await res.json()) as {
      results?: DetectionResult[];
      raw?: Record<string, unknown>;
    };
    return {
      results: data.results ?? [],
      raw: data.raw ?? { engine: "http", endpoint },
    };
  }
}

/*
 * ── דוגמה: חיבור מנוע AI/OCR אמיתי משלכם ─────────────────────────────────────
 * אם תרצו לוגיקת מיפוי מותאמת (למשל Google Document AI / Azure / מודל פנימי),
 * העתיקו את התבנית הבאה, ממשו את הממשק, והחליפו את ה-singleton למטה — זהו,
 * אף מסך לא משתנה:
 *
 *   class MyVendorProcessor implements AttendanceDocumentProcessor {
 *     async process({ fileUrl, students, context }: ProcessorInput): Promise<ProcessorOutput> {
 *       const resp = await fetch("https://ocr.example.com/analyze", {
 *         method: "POST",
 *         headers: {
 *           "Content-Type": "application/json",
 *           "Authorization": `Bearer ${import.meta.env.VITE_ATTENDANCE_OCR_TOKEN}`,
 *         },
 *         body: JSON.stringify({ document: fileUrl, roster: students, context }),
 *       });
 *       const payload = await resp.json();
 *       // מיפוי הפורמט של הספק ל-DetectionResult[] של המערכת:
 *       const results: DetectionResult[] = payload.cells.map((c) => ({
 *         student_id: c.matchedStudentId,
 *         attendance_status: mapVendorMark(c.mark), // הפונקציה שלכם: "V" → on_time וכו'
 *         detection_confidence: c.score,            // 0..1
 *         box: c.bbox,                              // { page, x, y, width, height }
 *       }));
 *       return { results, raw: payload };
 *     }
 *   }
 *   export const attendanceDocumentProcessor = new MyVendorProcessor();
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* -------------------------------------------------------------------------- *
 * AnthropicVisionProcessor — מנוע זיהוי אמיתי מבוסס Claude Vision.
 *
 * הזרימה (הכל בצד-הלקוח, למעט קריאת המודל שרצה ב-Edge Function):
 *   1. הורדת הקובץ הסרוק מ-Storage (הנתיב מגיע כ-fileUrl).
 *   2. רסטריזציה: PDF → קנבס לכל עמוד (‎pdfjs, אותה הגדרה כמו studentListParser),
 *      תמונה → קנבס יחיד. כל קנבס נחתך אנכית ל-N פסי-עמודות (ברירת מחדל 4, עם
 *      חפיפה קלה כדי לא לחתוך שם על גבול העמודה). הסדר אינו קריטי — הדיוק כן.
 *   3. שליחת כל פס ל-Edge Function "detect-attendance" (concurrency מוגבל).
 *   4. התאמת כל שם שזוהה ל-student_id (נורמליזציה + התאמה מדויקת → הכלה → דמיון).
 *   5. מיפוי סימון → סטטוס: a→on_time, b→late_b, c→late_c, none→מושמט (⇒ נעדר).
 *
 * כשל (חסר ANTHROPIC_API_KEY בשרת ⇒ 500, כשל הורדה, אין זיהוי) → זורק שגיאה
 * ברורה בעברית, כך שמסך ההעלאה מציג אותה ולא "מצליח בשקט" עם דוח ריק.
 * -------------------------------------------------------------------------- */

/** עמודות-הסימון הקיימות בדף כברירת מחדל. שנו ל-["א","ב","ג"] בדפים עם עמודת ג׳. */
const MARK_COLUMNS = ["א", "ב", "ג"];
/** כמות פסי-עמודות ברירת מחדל לחיתוך עמוד רחב. */
// מספר העמודות הפיזיות שהדף מחולק אליהן לפני שליחה למנוע הזיהוי.
// ניתן לכוונון דרך VITE_ATTENDANCE_PHYSICAL_COLUMNS (למשל 3 לדף 3-עמודות,
// או 1 לשליחת העמוד השלם — שומר שם+סימונים יחד ומונע פיצול). ברירת מחדל 4.
const DEFAULT_COLUMN_COUNT =
  Number(import.meta.env.VITE_ATTENDANCE_PHYSICAL_COLUMNS) || 4;
/** חפיפה אופקית בין פסים (כשבר מרוחב הפס) כדי לא לחתוך שם על הגבול. */
const COLUMN_OVERLAP = 0.04;
/** קנה-מידה לרסטריזציה של PDF (‎~2x לחדות סבירה בכתב-יד). */
const RASTER_SCALE = 5;
/**
 * רוחב-היעד (בפיקסלים) של הדף המרונדר. סריקות רבות מגדירות דף "קטן" בנקודות,
 * כך ש-scale קבוע (RASTER_SCALE) מייצר רזולוציה נמוכה ומטשטש סריקה איכותית.
 * אנו מחשבים את ה-scale לפי רוחב-היעד הזה כדי להבטיח רזולוציה גבוהה בכל מקרה.
 */
const TARGET_RENDER_WIDTH = 5000;
/** תקרת scale למניעת קנבס ענק (זיכרון). */
const MAX_RENDER_SCALE = 14;
/** חפיפה אנכית בין רצועות-שורות, כדי ששורה לא תיחתך באמצע. */
const ROW_BAND_OVERLAP = 0.03;
/** חידוד ניגודיות + גווני-אפור כדי שסימוני-יד דהויים יבלטו מול הרקע הלבן. */
const TILE_FILTER = "grayscale(1) contrast(1.55) brightness(1.03)";
/** כמה פסים לשלוח במקביל ל-Edge Function. */
const STRIP_CONCURRENCY = 3;
/** סף התאמת-שם מינימלי (מתחתיו הזיהוי נזרק, הבחור נשאר "נעדר"). */
const NAME_MATCH_THRESHOLD = 0.5;

const MARK_TO_STATUS: Record<string, AttendanceStatus | null> = {
  a: "on_time",
  b: "late_b",
  c: "late_c",
  none: null,
};

interface PageStrips {
  page: number;
  strips: string[]; // data URLs (PNG)
}

interface StripImage {
  id: string;
  base64: string;
  mediaType: string;
  page: number;
  column: number;
}

interface EdgeDetectResponse {
  results?: {
    id: string;
    rows?: { name: string; mark: string; confidence: number }[];
    error?: string;
  }[];
  error?: string;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function isPdfFile(fileName: string | null | undefined, blobType: string): boolean {
  const name = (fileName ?? "").toLowerCase();
  if (name.endsWith(".pdf")) return true;
  return (blobType ?? "").toLowerCase().includes("pdf");
}

/** בוחר כמה עמודות לחתוך לפי יחס-הממדים: עמוד צר מאוד = עמודה בודדת. */
function chooseColumnCount(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1;
  const aspect = width / height;
  if (aspect < 0.45) return 1; // רצועה צרה — כנראה כבר עמודה בודדת
  return DEFAULT_COLUMN_COUNT;
}

/** מפרק data:image/png;base64,XXX ל-base64 + mediaType. */
function splitDataUrl(dataUrl: string): { base64: string; mediaType: string } {
  const comma = dataUrl.indexOf(",");
  const header = comma >= 0 ? dataUrl.slice(0, comma) : "";
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const m = /data:([^;]+)/.exec(header);
  return { base64, mediaType: m?.[1] ?? "image/png" };
}

/**
 * חותך את העמוד לאריחים: קודם אנכית ל-N עמודות, ואז כל עמודה אופקית
 * לרצועות-שורות ~ריבועיות.
 *
 * למה גם אופקית: עמודה שלמה היא תמונה עם 60–200 שורות, וסימון-יד זעיר
 * "נבלע" בה (וגם עלולה לרדת ברזולוציה בצד המודל). אריח ~ריבועי מכיל
 * מעט שורות, כך שכל וי/קו תופס הרבה יותר פיקסלים ונקרא הרבה יותר טוב.
 */
/** עוצמת-הכהות הממוצעת של כל שורת-פיקסלים (0=לבן, 255=שחור). לזיהוי מרווחים. */
function rowDarkness(canvas: HTMLCanvasElement): Float32Array {
  const { width, height } = canvas;
  const dark = new Float32Array(height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || width === 0) return dark;
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const base = y * width * 4;
    for (let x = 0; x < width; x++) {
      const o = base + x * 4;
      sum += 255 - (data[o] + data[o + 1] + data[o + 2]) / 3;
    }
    dark[y] = sum / width;
  }
  return dark;
}

/** גבולות-חיתוך אנכיים המוצמדים למרווחים הלבנים בין שורות-הטקסט. */
function findBandCuts(dark: Float32Array, height: number, bands: number): number[] {
  const cuts = [0];
  const bandH = height / bands;
  const win = Math.max(2, Math.round(bandH * 0.4));
  for (let k = 1; k < bands; k++) {
    const target = Math.round(k * bandH);
    let best = target;
    let bestVal = Infinity;
    const from = Math.max(1, target - win);
    const to = Math.min(height - 1, target + win);
    for (let y = from; y <= to; y++) {
      if (dark[y] < bestVal) {
        bestVal = dark[y];
        best = y;
      }
    }
    cuts.push(best);
  }
  cuts.push(height);
  return cuts;
}

function splitCanvasToStrips(
  source: HTMLCanvasElement,
  columns: number,
  overlap: number,
): string[] {
  const cols = Math.max(1, columns);
  const stripW = source.width / cols;
  const padX = cols > 1 ? stripW * overlap : 0;
  const out: string[] = [];

  for (let i = 0; i < cols; i++) {
    const sx = Math.max(0, Math.floor(i * stripW - padX));
    const sxEnd = Math.min(source.width, Math.ceil((i + 1) * stripW + padX));
    const sw = sxEnd - sx;
    if (sw <= 0) continue;

    // מחלצים את העמודה לקנבס נפרד (בלי פילטר) — משמש גם לניתוח מרווחים
    // וגם כמקור-ציור, כדי לחתוך רק בין שורות ולא באמצע שם.
    const col = document.createElement("canvas");
    col.width = sw;
    col.height = source.height;
    const cctx = col.getContext("2d", { willReadFrequently: true });
    if (!cctx) continue;
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = "high";
    cctx.drawImage(source, sx, 0, sw, source.height, 0, 0, sw, source.height);

    // מספר רצועות כך שכל אריח יֵצא בערך ריבועי, וחיתוך מוצמד למרווחים.
    const bands = Math.max(1, Math.round(source.height / sw));
    let cuts: number[];
    try {
      cuts =
        bands > 1
          ? findBandCuts(rowDarkness(col), source.height, bands)
          : [0, source.height];
    } catch {
      // אם קריאת הפיקסלים נכשלת — נופלים לחלוקה שווה.
      cuts = [];
      for (let b = 0; b <= bands; b++) cuts.push(Math.round((b * source.height) / bands));
    }

    for (let b = 0; b < cuts.length - 1; b++) {
      const cy = cuts[b];
      const cyEnd = cuts[b + 1];
      const padY = bands > 1 ? Math.round((cyEnd - cy) * ROW_BAND_OVERLAP) : 0;
      const sy = Math.max(0, cy - padY);
      const syEnd = Math.min(source.height, cyEnd + padY);
      const sh = syEnd - sy;
      if (sh <= 4) continue;
      const tile = document.createElement("canvas");
      tile.width = sw;
      tile.height = sh;
      const tctx = tile.getContext("2d");
      if (!tctx) continue;
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = "high";
      // חידוד ניגודיות כדי שטקסט וסימונים דהויים יבלטו לפני שליחה למודל.
      tctx.filter = TILE_FILTER;
      tctx.drawImage(col, 0, sy, sw, sh, 0, 0, sw, sh);
      out.push(tile.toDataURL("image/png"));
    }
  }
  return out;
}

/** טוען את pdfjs (עם worker) ומחזיר מסמך PDF פתוח. משותף למסלול-האריחים (Vision)
 *  ולמסלול-העמודות (Tesseract) כדי לא לשכפל את הגדרת ה-worker. */
async function loadPdfDocument(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  ).default;
  return pdfjs.getDocument({ data: bytes }).promise;
}

/** רסטריזציה של PDF לתמונות-עמודות (אותה הגדרת pdfjs כמו studentListParser). */
async function rasterizePdf(bytes: Uint8Array): Promise<PageStrips[]> {
  const pdf = await loadPdfDocument(bytes);
  const pages: PageStrips[] = [];
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const _base = page.getViewport({ scale: 1 });
      const _scale = Math.min(
        MAX_RENDER_SCALE,
        Math.max(RASTER_SCALE, TARGET_RENDER_WIDTH / _base.width),
      );
      const viewport = page.getViewport({ scale: _scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const cols = chooseColumnCount(canvas.width, canvas.height);
      pages.push({ page: p, strips: splitCanvasToStrips(canvas, cols, COLUMN_OVERLAP) });
    }
  } finally {
    await pdf.cleanup().catch(() => {});
    await pdf.destroy().catch(() => {});
  }
  return pages;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("טעינת התמונה נכשלה."));
    img.src = url;
  });
}

/** רסטריזציה של קובץ תמונה (png/jpeg/...) לפסי-עמודות. */
async function rasterizeImage(blob: Blob): Promise<PageStrips[]> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("יצירת קנבס לעיבוד התמונה נכשלה.");
    ctx.drawImage(img, 0, 0);
    const cols = chooseColumnCount(canvas.width, canvas.height);
    return [{ page: 1, strips: splitCanvasToStrips(canvas, cols, COLUMN_OVERLAP) }];
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** מפתח השוואה לשם: מצמצם רווחים, מסיר גרש/גרשיים/מרכאות (מאחד ב"ר→בר). */
function normalizeNameKey(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[֑-ׇ]/g, "") // ניקוד/טעמים
    .replace(/[׳״'"`´‘’“”]/g, "") // גרש/גרשיים/מרכאות → מוסרים
    // הסרת כל מה שאינו אות עברית או רווח — ספרות, לועזית, סוגריים, קווים,
    // ורעש-טבלה שהמודל עלול להדביק לשם.
    .replace(/[^א-ת ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** דמיון מבוסס-מילים (מקדם Dice) בין שני מפתחות מנורמלים. */
function tokenSimilarity(a: string, b: string): number {
  const ta = a.split(" ").filter(Boolean);
  const tb = b.split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  let inter = 0;
  for (const t of ta) if (setB.has(t)) inter++;
  return (2 * inter) / (ta.length + tb.length);
}

interface StudentEntry {
  student: StudentInput;
  key: string;
  compact: string;
}

interface StudentIndex {
  byKey: Map<string, StudentInput>;
  all: StudentEntry[];
}

function buildStudentIndex(students: StudentInput[]): StudentIndex {
  const byKey = new Map<string, StudentInput>();
  const all: StudentEntry[] = [];
  for (const s of students) {
    const key = normalizeNameKey(s.full_name);
    const compact = key.replace(/ /g, "");
    if (key && !byKey.has(key)) byKey.set(key, s);
    all.push({ student: s, key, compact });
  }
  return { byKey, all };
}

/** מתאים שם שזוהה לבחור: מדויק → הכלה → דמיון. מחזיר את הבחור ורמת-ההתאמה. */
function matchStudent(
  detectedName: string,
  index: StudentIndex,
): { student: StudentInput; matchConf: number } | null {
  const key = normalizeNameKey(detectedName);
  if (!key) return null;

  const exact = index.byKey.get(key);
  if (exact) return { student: exact, matchConf: 1 };

  const compact = key.replace(/ /g, "");
  let best: StudentInput | null = null;
  let bestScore = 0;
  for (const e of index.all) {
    let score = tokenSimilarity(key, e.key);
    if (
      compact.length >= 4 &&
      e.compact.length >= 4 &&
      (compact.includes(e.compact) || e.compact.includes(compact))
    ) {
      const ratio =
        Math.min(compact.length, e.compact.length) /
        Math.max(compact.length, e.compact.length);
      score = Math.max(score, 0.6 + 0.4 * ratio);
    }
    if (score > bestScore) {
      bestScore = score;
      best = e.student;
    }
  }
  if (best && bestScore >= NAME_MATCH_THRESHOLD) {
    return { student: best, matchConf: clamp01(bestScore) };
  }
  return null;
}

/** קריאה בודדת ל-Edge Function; שולף הודעת-שגיאה עברית מגוף התשובה בכשל HTTP. */
async function invokeDetect(
  images: { id: string; base64: string; mediaType: string; columns: string[] }[],
  context: ProcessorContext | undefined,
): Promise<EdgeDetectResponse> {
  const { data, error } = await supabase.functions.invoke<EdgeDetectResponse>(
    "detect-attendance",
    { body: { images, context: context ?? null } },
  );
  if (error) {
    let serverMsg = "";
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const body = (await ctx.json()) as { error?: string };
        serverMsg = body?.error ?? "";
      }
    } catch {
      // אין גוף JSON — נשארים עם הודעת ה-error המקורית.
    }
    throw new Error(serverMsg || error.message || "קריאת שירות הזיהוי נכשלה.");
  }
  if (data?.error) throw new Error(data.error);
  return data ?? { results: [] };
}

class AnthropicVisionProcessor implements AttendanceDocumentProcessor {
  async process({
    fileUrl,
    fileName,
    file,
    students,
    context,
  }: ProcessorInput): Promise<ProcessorOutput> {
    if (typeof window === "undefined") {
      throw new Error("זיהוי הנוכחות האוטומטי זמין רק בדפדפן.");
    }
    if (!file && !fileUrl) {
      throw new Error(
        "לא צורף קובץ סרוק לזיהוי. יש להעלות תמונה או PDF של דף רישום הנוכחות.",
      );
    }

    // 1) קבלת בייטים לעיבוד: עדיפות לקובץ שכבר בזיכרון (מונע הורדה חוזרת
    //    מ-Storage שנכשלת לעיתים בגלל סינון/CORS). אחרת — הורדה מ-Storage.
    let blob: Blob;
    if (file) {
      blob = file;
    } else {
      const { data, error: dlErr } = await supabase.storage
        .from("attendance-reports")
        .download(fileUrl);
      if (dlErr || !data) {
        throw new Error(
          `הורדת הקובץ הסרוק נכשלה: ${dlErr?.message ?? "הקובץ לא נמצא ב-Storage"}.`,
        );
      }
      blob = data;
    }

    // 2) רסטריזציה לפסי-עמודות.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let pages: PageStrips[];
    try {
      pages = isPdfFile(fileName, blob.type)
        ? await rasterizePdf(bytes)
        : await rasterizeImage(blob);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`עיבוד הקובץ הסרוק נכשל: ${msg}`);
    }

    const strips: StripImage[] = [];
    for (const pg of pages) {
      pg.strips.forEach((dataUrl, ci) => {
        const { base64, mediaType } = splitDataUrl(dataUrl);
        strips.push({
          id: `p${pg.page}-c${ci + 1}`,
          base64,
          mediaType,
          page: pg.page,
          column: ci + 1,
        });
      });
    }

    if (strips.length === 0) {
      throw new Error(
        "לא הצלחנו להפיק תמונות עמודות מהקובץ. ודאו שהקובץ הוא סריקה תקינה (PDF או תמונה).",
      );
    }

    // 3) קריאה ל-Edge Function לכל פס, עם concurrency מוגבל.
    const detected: {
      name: string;
      mark: string;
      confidence: number;
      page: number;
      column: number;
    }[] = [];
    const stripErrors: { id: string; error: string }[] = [];
    let fatal: string | null = null;
    let next = 0;

    const runStrip = async () => {
      while (true) {
        const i = next++;
        if (i >= strips.length) return;
        const strip = strips[i];
        try {
          const { results } = await invokeDetect(
            [
              {
                id: strip.id,
                base64: strip.base64,
                mediaType: strip.mediaType,
                columns: MARK_COLUMNS,
              },
            ],
            context,
          );
          const r = results?.[0];
          if (r?.error) stripErrors.push({ id: strip.id, error: r.error });
          for (const row of r?.rows ?? []) {
            detected.push({
              name: row.name,
              mark: row.mark,
              confidence: row.confidence,
              page: strip.page,
              column: strip.column,
            });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          fatal = fatal ?? msg;
          stripErrors.push({ id: strip.id, error: msg });
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(STRIP_CONCURRENCY, strips.length) }, () =>
        runStrip(),
      ),
    );

    // 4) התאמת שמות ל-student_id + 5) מיפוי סימון → סטטוס.
    const index = buildStudentIndex(students);
    const byStudent = new Map<string, DetectionResult>();
    const unmatched: string[] = [];

    for (const row of detected) {
      if (row.mark === "none") continue; // נעדר — resolveRoster יגדיר אותו
      const status = MARK_TO_STATUS[row.mark];
      if (!status) continue;
      const match = matchStudent(row.name, index);
      if (!match) {
        unmatched.push(row.name);
        continue;
      }
      const modelConf = clamp01(typeof row.confidence === "number" ? row.confidence : 0.5);
      const conf = Number((modelConf * match.matchConf).toFixed(3));
      const prev = byStudent.get(match.student.id);
      if (!prev || conf > prev.detection_confidence) {
        byStudent.set(match.student.id, {
          student_id: match.student.id,
          attendance_status: status,
          detection_confidence: conf,
        });
      }
    }

    const results = Array.from(byStudent.values());

    // אין להחזיר ריק בשקט — נצוף שגיאה ברורה כדי שמסך ההעלאה יראה מה קרה.
    if (results.length === 0) {
      if (fatal) throw new Error(fatal);
      if (detected.length === 0) {
        throw new Error(
          stripErrors[0]?.error ??
            "לא זוהו סימוני נוכחות בקובץ. ודאו שהסריקה ברורה ומכילה דף רישום נוכחות.",
        );
      }
      // מציגים דוגמאות משני הצדדים כדי שאפשר יהיה לראות מיד היכן הפער.
      const sampleDetected = detected
        .slice(0, 4)
        .map((d) => d.name)
        .filter(Boolean)
        .join(" | ");
      const sampleRoster = students
        .slice(0, 4)
        .map((s) => s.full_name)
        .join(" | ");
      throw new Error(
        `זוהו ${detected.length} שורות בקובץ אך אף שם לא הותאם לרשימת הבחורים. ` +
          `זוהו בדף: [${sampleDetected || "—"}] · ברשימה: [${sampleRoster || "—"}]`,
      );
    }

    return {
      results,
      raw: {
        engine: "anthropic-vision",
        model_note:
          "נקבע בשרת דרך ATTENDANCE_VISION_MODEL (ברירת מחדל claude-opus-4-8)",
        file: fileName ?? fileUrl,
        page_count: pages.length,
        column_count: strips.length,
        mark_columns: MARK_COLUMNS,
        detected_rows: detected.length,
        matched: results.length,
        unmatched_names: unmatched,
        strip_errors: stripErrors,
        processed_at: new Date().toISOString(),
      },
    };
  }
}

/* -------------------------------------------------------------------------- *
 * TesseractOcrProcessor — OCR חינמי 100% בצד-הלקוח (Tesseract.js, עברית "heb").
 *
 * שונה מ-AnthropicVisionProcessor: אין קריאת API בתשלום ואין חיתוך לרצועות-שורות.
 * במקום זאת מרסטרים כל עמוד לקנבסי-עמודות בגובה-מלא, מריצים OCR עברי על כל עמודה
 * (Tesseract קורא בלוק רב-שורות בעצמו), מתאימים כל שורה שזוהתה לרשימת הבחורים,
 * ומזהים את הסימון היוריסטית לפי כהות-פיקסלים באזור התאים משמאל לשם (RTL).
 * -------------------------------------------------------------------------- */

/** עמוד לאחר רסטריזציה: קנבסי-עמודות בגובה-מלא (ללא חיתוך רצועות-שורות). */
interface PageColumns {
  page: number;
  columns: HTMLCanvasElement[];
}

/**
 * חותך עמוד שלם לקנבסי-עמודות אנכיים בגובה-מלא — זהה ללולאת-העמודות של
 * splitCanvasToStrips אך *ללא* חיתוך אופקי לרצועות-שורות. שומר את קנבס-העמודה
 * השלם כי אותם פיקסלים משמשים גם ל-OCR וגם למדידת-כהות של הסימונים.
 */
function splitCanvasToColumns(
  source: HTMLCanvasElement,
  columns: number,
  overlap: number,
): HTMLCanvasElement[] {
  const cols = Math.max(1, columns);
  const stripW = source.width / cols;
  const padX = cols > 1 ? stripW * overlap : 0;
  const out: HTMLCanvasElement[] = [];
  for (let i = 0; i < cols; i++) {
    const sx = Math.max(0, Math.floor(i * stripW - padX));
    const sxEnd = Math.min(source.width, Math.ceil((i + 1) * stripW + padX));
    const sw = sxEnd - sx;
    if (sw <= 0) continue;
    const col = document.createElement("canvas");
    col.width = sw;
    col.height = source.height;
    const cctx = col.getContext("2d", { willReadFrequently: true });
    if (!cctx) continue;
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = "high";
    // ציור נקי (ללא TILE_FILTER בכוונה): אותו קנבס משמש גם למדידת-כהות הסימון,
    // ולכן חובה לשמר ערכי-פיקסל אמיתיים (Tesseract מבצע בינריזציה בעצמו).
    cctx.drawImage(source, sx, 0, sw, source.height, 0, 0, sw, source.height);
    out.push(col);
  }
  return out;
}

/** רסטריזציה של PDF לקנבסי-עמודות בגובה-מלא (אותה הגדרת pdfjs כמו מסלול-האריחים). */
async function rasterizePdfToColumns(bytes: Uint8Array): Promise<PageColumns[]> {
  const pdf = await loadPdfDocument(bytes);
  const pages: PageColumns[] = [];
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const _base = page.getViewport({ scale: 1 });
      const _scale = Math.min(
        MAX_RENDER_SCALE,
        Math.max(RASTER_SCALE, TARGET_RENDER_WIDTH / _base.width),
      );
      const viewport = page.getViewport({ scale: _scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const cols = chooseColumnCount(canvas.width, canvas.height);
      pages.push({ page: p, columns: splitCanvasToColumns(canvas, cols, COLUMN_OVERLAP) });
    }
  } finally {
    await pdf.cleanup().catch(() => {});
    await pdf.destroy().catch(() => {});
  }
  return pages;
}

/** רסטריזציה של תמונה בודדת לקנבסי-עמודות בגובה-מלא. */
async function rasterizeImageToColumns(blob: Blob): Promise<PageColumns[]> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("יצירת קנבס לעיבוד התמונה נכשלה.");
    ctx.drawImage(img, 0, 0);
    const cols = chooseColumnCount(canvas.width, canvas.height);
    return [{ page: 1, columns: splitCanvasToColumns(canvas, cols, COLUMN_OVERLAP) }];
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ── טיפוסי-משנה מינימליים לתוצאת Tesseract (מנותקים מהחבילה, כדי לא לתלות ב-SSR) ── */
interface OcrBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface OcrLine {
  text?: string;
  confidence?: number;
  bbox?: OcrBbox;
  words?: { bbox?: OcrBbox }[];
}
interface OcrPage {
  text?: string;
  confidence?: number;
  blocks?: { paragraphs?: { lines?: OcrLine[] }[] }[] | null;
}
interface TesseractWorker {
  setParameters(params: Record<string, unknown>): Promise<unknown>;
  recognize(
    image: HTMLCanvasElement,
    options?: Record<string, unknown>,
    output?: Record<string, unknown>,
  ): Promise<{ data: OcrPage }>;
  terminate(): Promise<unknown>;
}
interface TesseractModule {
  createWorker(
    langs?: string,
    oem?: number,
    options?: Record<string, unknown>,
  ): Promise<TesseractWorker>;
}

/** שורת-OCR מנורמלת: טקסט + גבולות-y בתוך קנבס-העמודה (משמש לזיהוי-הסימון). */
interface OcrRow {
  text: string;
  y0: number;
  y1: number;
  confidence: number;
}

/**
 * מחלץ שורות-טקסט + גבולות-y מתוצאת Tesseract. מעדיף את מבנה ה-blocks
 * (blocks→paragraphs→lines→bbox); אם אינו זמין — נופל לחלוקת data.text לשורות
 * עם גבולות-y מוערכים בחלוקה שווה על-פני גובה הקנבס (מאפשר זיהוי-סימון גס).
 */
function extractOcrRows(page: OcrPage, canvasHeight: number): OcrRow[] {
  const rows: OcrRow[] = [];
  const blocks = page?.blocks;
  if (Array.isArray(blocks)) {
    for (const b of blocks) {
      for (const p of b?.paragraphs ?? []) {
        for (const ln of p?.lines ?? []) {
          const text = (ln?.text ?? "").trim();
          if (!text) continue;
          const bb = ln?.bbox ?? ln?.words?.[0]?.bbox;
          rows.push({
            text,
            y0: bb ? bb.y0 : 0,
            y1: bb ? bb.y1 : canvasHeight,
            confidence: typeof ln?.confidence === "number" ? ln.confidence : 50,
          });
        }
      }
    }
  }
  if (rows.length === 0 && page?.text) {
    // גיבוי (אין bbox): מחלקים את הטקסט לשורות עם גבולות-y שווים.
    const lines = page.text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const band = lines.length > 0 ? canvasHeight / lines.length : canvasHeight;
    lines.forEach((text, i) => {
      rows.push({ text, y0: i * band, y1: (i + 1) * band, confidence: 40 });
    });
  }
  return rows;
}

/** רוחב יחסי של אזור-הסימונים (השמאלי — ב-RTL הסימונים משמאל לשם). */
const MARK_REGION_FRAC = 0.42;
/** כהות מינימלית (0..255) של התא הכהה מעל תא-הבסיס הבהיר כדי להיחשב "מסומן". */
const MARK_MIN_DARKNESS = 12;
/** פער-כהות מינימלי בין התא הכהה ביותר לשני-בכהותו (מונע זיהוי-כפול/רעש). */
const MARK_SEPARATION = 7;
/** בסיס-ודאות לזיהוי מבוסס-OCR (משולב עם ודאות ההתאמה וה-OCR). */
const TESSERACT_BASE_CONFIDENCE = 0.6;

/**
 * זיהוי-סימון היוריסטי מבוסס כהות-פיקסלים, best-effort — *לעולם לא זורק*.
 * מסתכל על החלק השמאלי של השורה (ב-RTL הסימונים משמאל לשם), מחלק אותו אופקית
 * ל-|MARK_COLUMNS| תאים ומחשב כהות ממוצעת בכל תא. אם *בדיוק* תא אחד כהה בבירור
 * מעל התא הבהיר ביותר (רקע ריק) וגם מעל השני-בכהותו — ממפים דרך MARK_TO_STATUS
 * (index 0→a, 1→b, 2→c). אחרת null ⇒ הבחור יסומן "נעדר" ב-resolveRoster.
 * הערה: המיפוי מניח סדר-תאים a,b,c משמאל-לימין; אם עמודות-הסימון בדף הפוכות יש
 * להחליף את הכיוון של maxIdx.
 */
function detectRowMark(
  canvas: HTMLCanvasElement,
  y0: number,
  y1: number,
): AttendanceStatus | null {
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const W = canvas.width;
    const H = canvas.height;
    const top = Math.max(0, Math.min(H - 1, Math.floor(y0)));
    const bottom = Math.max(top + 1, Math.min(H, Math.ceil(y1)));
    const bandH = bottom - top;
    const cells = MARK_COLUMNS.length;
    const regionW = Math.floor(W * MARK_REGION_FRAC);
    if (bandH < 4 || regionW < cells * 2) return null;
    const cellW = Math.floor(regionW / cells);
    if (cellW < 1) return null;

    const darkness: number[] = [];
    for (let c = 0; c < cells; c++) {
      const cx = c * cellW;
      const data = ctx.getImageData(cx, top, cellW, bandH).data;
      let sum = 0;
      for (let o = 0; o < data.length; o += 4) {
        sum += 255 - (data[o] + data[o + 1] + data[o + 2]) / 3; // 0=לבן, 255=שחור
      }
      darkness.push(sum / (cellW * bandH));
    }

    let maxIdx = 0;
    for (let c = 1; c < cells; c++) if (darkness[c] > darkness[maxIdx]) maxIdx = c;
    const sorted = [...darkness].sort((a, b) => a - b);
    const baseline = sorted[0]; // התא הבהיר ביותר ≈ רקע ריק
    const runnerUp = sorted[sorted.length - 2];
    const max = sorted[sorted.length - 1];
    // חייב להיות כהה מספיק מעל הרקע, וגם לבלוט מעל שאר התאים.
    if (max < baseline + MARK_MIN_DARKNESS) return null;
    if (max < runnerUp + MARK_SEPARATION) return null;
    const key = ["a", "b", "c"][maxIdx];
    return MARK_TO_STATUS[key] ?? null;
  } catch {
    return null; // זיהוי-סימון לעולם לא מפיל את כל התהליך
  }
}

class TesseractOcrProcessor implements AttendanceDocumentProcessor {
  async process({
    fileUrl,
    fileName,
    file,
    students,
    context: _context,
  }: ProcessorInput): Promise<ProcessorOutput> {
    // 1) Tesseract.js רץ רק בדפדפן (WebAssembly + Canvas).
    if (typeof window === "undefined") {
      throw new Error("זיהוי הנוכחות (Tesseract) זמין רק בדפדפן.");
    }
    if (!file && !fileUrl) {
      throw new Error(
        "לא צורף קובץ סרוק לזיהוי. יש להעלות תמונה או PDF של דף רישום הנוכחות.",
      );
    }

    // 2) קבלת בייטים: עדיפות לקובץ שכבר בזיכרון, אחרת הורדה מ-Storage.
    let blob: Blob;
    if (file) {
      blob = file;
    } else {
      const { data, error: dlErr } = await supabase.storage
        .from("attendance-reports")
        .download(fileUrl);
      if (dlErr || !data) {
        throw new Error(
          `הורדת הקובץ הסרוק נכשלה: ${dlErr?.message ?? "הקובץ לא נמצא ב-Storage"}.`,
        );
      }
      blob = data;
    }

    // 3) רסטריזציה לקנבסי-עמודות בגובה-מלא (ללא חיתוך רצועות-שורות).
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let pages: PageColumns[];
    try {
      pages = isPdfFile(fileName, blob.type)
        ? await rasterizePdfToColumns(bytes)
        : await rasterizeImageToColumns(blob);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`עיבוד הקובץ הסרוק נכשל: ${msg}`);
    }

    const columns: { page: number; column: number; canvas: HTMLCanvasElement }[] = [];
    pages.forEach((pg) =>
      pg.columns.forEach((canvas, ci) =>
        columns.push({ page: pg.page, column: ci + 1, canvas }),
      ),
    );
    if (columns.length === 0) {
      throw new Error(
        "לא הצלחנו להפיק תמונות עמודות מהקובץ. ודאו שהקובץ הוא סריקה תקינה (PDF או תמונה).",
      );
    }

    // 4) טעינת Tesseract (dynamic import — client-only, לא שובר SSR) והרצת OCR
    //    עברי על כל קנבס-עמודה. משתמשים ב-worker כדי לקבל blocks עם bbox לכל
    //    שורה (Tesseract.recognize ברמת-העל מפיק טקסט בלבד ללא bbox ב-v7), עם
    //    langPath/corePath אופציונליים כדי לצמצם תלות ב-CDN (למשל ברשת מסוננת).
    const langPath = import.meta.env.VITE_TESSERACT_LANG_PATH as string | undefined;
    const corePath = import.meta.env.VITE_TESSERACT_CORE_PATH as string | undefined;
    const workerOptions: Record<string, unknown> = {};
    if (langPath) workerOptions.langPath = langPath;
    if (corePath) workerOptions.corePath = corePath;

    const mod = await import("tesseract.js");
    const Tesseract = ((mod as unknown as { default?: unknown }).default ??
      mod) as unknown as TesseractModule;

    const index = buildStudentIndex(students);
    const byStudent = new Map<string, DetectionResult>();
    const unmatched: string[] = [];
    const ocrSamples: string[] = [];
    let detectedRows = 0;

    const worker = await Tesseract.createWorker("heb", 1, workerOptions);
    try {
      // PSM=6 (SINGLE_BLOCK): עמודה = בלוק שורות אחיד — קריאה יציבה של שמות.
      await worker.setParameters({ tessedit_pageseg_mode: "6" }).catch(() => {});

      for (const col of columns) {
        let page: OcrPage;
        try {
          // output={blocks:true} → מקבלים bbox לכל שורה (חיוני לזיהוי-הסימון).
          const res = await worker.recognize(col.canvas, {}, { blocks: true });
          page = res.data;
        } catch {
          continue; // כשל OCR בעמודה בודדת — ממשיכים לשאר.
        }

        const rows = extractOcrRows(page, col.canvas.height);
        for (const row of rows) {
          detectedRows++;
          if (ocrSamples.length < 6) ocrSamples.push(row.text);

          // 5) התאמת השורה לבחור.
          const match = matchStudent(row.text, index);
          if (!match) {
            if (unmatched.length < 40) unmatched.push(row.text);
            continue;
          }

          // 6) זיהוי-סימון; ללא סימון ברור מדלגים ⇒ "נעדר" ב-resolveRoster.
          const status = detectRowMark(col.canvas, row.y0, row.y1);
          if (!status) continue;

          // 7) ודאות: בסיס 0.6, משולב עם ודאות-ההתאמה וודאות-ה-OCR (0..100).
          const ocrNorm = clamp01((row.confidence || 0) / 100);
          const conf = Number(
            (
              TESSERACT_BASE_CONFIDENCE +
              (1 - TESSERACT_BASE_CONFIDENCE) * match.matchConf * ocrNorm
            ).toFixed(3),
          );
          const prev = byStudent.get(match.student.id);
          if (!prev || conf > prev.detection_confidence) {
            byStudent.set(match.student.id, {
              student_id: match.student.id,
              attendance_status: status,
              detection_confidence: conf,
            });
          }
        }
      }
    } finally {
      await worker.terminate().catch(() => {});
    }

    const results = Array.from(byStudent.values());

    // אין להחזיר ריק בשקט — שגיאה ברורה עם דוגמאות משני הצדדים (כמו Vision).
    if (results.length === 0) {
      if (detectedRows === 0) {
        throw new Error(
          "לא זוהה טקסט בקובץ. ודאו שהסריקה ברורה ומכילה דף רישום נוכחות (Tesseract/עברית).",
        );
      }
      const sampleDetected = ocrSamples.slice(0, 4).filter(Boolean).join(" | ");
      const sampleRoster = students
        .slice(0, 4)
        .map((s) => s.full_name)
        .join(" | ");
      throw new Error(
        `זוהו ${detectedRows} שורות ב-OCR אך אף שם לא הותאם לרשימת הבחורים. ` +
          `זוהו בדף: [${sampleDetected || "—"}] · ברשימה: [${sampleRoster || "—"}]`,
      );
    }

    return {
      results,
      raw: {
        engine: "tesseract-ocr",
        detected_rows: detectedRows,
        matched: results.length,
        unmatched_names: unmatched,
        page_count: pages.length,
        column_count: columns.length,
        mark_columns: MARK_COLUMNS,
        lang_path: langPath ?? null,
        core_path: corePath ?? null,
        processed_at: new Date().toISOString(),
      },
    };
  }
}

const MODE = (import.meta.env.VITE_ATTENDANCE_PROCESSOR_MODE ?? "mock") as string;

function selectProcessor(mode: string): AttendanceDocumentProcessor {
  if (mode === "anthropic" || mode === "vision") return new AnthropicVisionProcessor();
  if (mode === "http" || mode === "real") return new HttpProcessor();
  if (mode === "tesseract" || mode === "ocr") return new TesseractOcrProcessor();
  return new MockProcessor();
}

export const attendanceDocumentProcessor: AttendanceDocumentProcessor =
  selectProcessor(MODE);
