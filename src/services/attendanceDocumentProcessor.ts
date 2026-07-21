/**
 * Attendance Document Processor
 * -----------------------------------------------------------------------------
 * שכבת שירות מנותקת (swappable) לזיהוי סימוני נוכחות ממסמכים סרוקים.
 *
 * העיצוב: ה-UI מדבר אך ורק מול הממשק `AttendanceDocumentProcessor` ומול ה-singleton
 * `attendanceDocumentProcessor`. אפשר להחליף את המימוש (MOCK → OCR/AI אמיתי) בלי
 * לגעת באף מסך. בחירת המימוש נעשית לפי משתנה סביבה בזמן build:
 *
 *   VITE_ATTENDANCE_PROCESSOR_MODE = "mock" (ברירת מחדל) | "http"
 *   VITE_ATTENDANCE_OCR_ENDPOINT   = כתובת שירות ה-OCR/AI (נדרש כאשר MODE=http)
 *
 * המימוש הנוכחי (MockProcessor) הוא דטרמיניסטי-למחצה: אותו קובץ + אותו בחור מחזירים
 * תמיד את אותה תוצאה, כך שבדיקות והדגמות יציבות (בניגוד לגרסה הקודמת שהחזירה
 * סטטוסים אקראיים בכל ריצה). הוא מקבל גם את הקשר סדר-הלימוד/השיעור ומחזיר
 * מטא-דאטה של מיקום (bounding box) לכל בחור תחת `raw`, לשימוש עתידי בהדגשת
 * הסימון על גבי הסריקה.
 * -----------------------------------------------------------------------------
 */

import type { AttendanceStatus } from "@/lib/hebrew";

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

const MODE = (import.meta.env.VITE_ATTENDANCE_PROCESSOR_MODE ?? "mock") as string;

export const attendanceDocumentProcessor: AttendanceDocumentProcessor =
  MODE === "http" || MODE === "real" ? new HttpProcessor() : new MockProcessor();
