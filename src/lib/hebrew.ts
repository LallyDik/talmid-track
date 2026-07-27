/*
 * Single source of truth for Hebrew labels across the app.
 * Other agents import from here — keep names/shapes stable.
 */

/* ---------------------------------------------------------------- *
 * Attendance
 * ---------------------------------------------------------------- */
export const attendanceLabels = {
  on_time: "א׳ — הגיע בזמן",
  late_b: "ב׳ — איחור",
  late_c: "ג׳ — איחור משמעותי",
  absent: "חסר — לא הגיע",
  excused: "מוצדק",
  unknown: "לא זוהה",
} as const;

export const attendanceShort = {
  on_time: "א׳",
  late_b: "ב׳",
  late_c: "ג׳",
  absent: "חסר",
  excused: "מוצדק",
  unknown: "—",
} as const;

export const attendanceClass = {
  on_time: "status-on-time",
  late_b: "status-late-b",
  late_c: "status-late-c",
  absent: "status-absent",
  excused: "status-excused",
  unknown: "status-unknown",
} as const;

/* ---------------------------------------------------------------- *
 * Student status
 * ---------------------------------------------------------------- */
export const studentStatusLabels = {
  active: "פעיל",
  inactive: "לא פעיל",
  vacation: "בחופשה",
  left: "עזב",
  suspended: "הושהה",
} as const;

/* ---------------------------------------------------------------- *
 * Attendance report processing status
 * ---------------------------------------------------------------- */
export const reportStatusLabels = {
  pending: "ממתין",
  processing: "בעיבוד",
  needs_review: "דורש בדיקה",
  approved: "אושר",
  failed: "נכשל",
} as const;

/* ---------------------------------------------------------------- *
 * Treatment status
 * ---------------------------------------------------------------- */
export const treatmentStatusLabels = {
  new: "חדש",
  in_progress: "בטיפול",
  waiting: "ממתין",
  completed: "הושלם",
  cancelled: "בוטל",
} as const;

/* ---------------------------------------------------------------- *
 * Task status
 * ---------------------------------------------------------------- */
export const taskStatusLabels = {
  open: "פתוחה",
  in_progress: "בעבודה",
  completed: "הושלמה",
  cancelled: "בוטלה",
} as const;

/* ---------------------------------------------------------------- *
 * Event / treatment severity
 * ---------------------------------------------------------------- */
export const severityLabels = {
  info: "מידע",
  low: "נמוכה",
  medium: "בינונית",
  high: "גבוהה",
  urgent: "דחופה",
} as const;

export const severityClass = {
  info: "severity-info",
  low: "severity-low",
  medium: "severity-medium",
  high: "severity-high",
  urgent: "severity-urgent",
} as const;

/* ---------------------------------------------------------------- *
 * Roles
 * ---------------------------------------------------------------- */
export const roleLabels = {
  admin: "מנהל מערכת",
  staff: "איש צוות",
  viewer: "צופה",
} as const;

/* ---------------------------------------------------------------- *
 * Task priority (1 = highest .. 3 = lowest)
 * ---------------------------------------------------------------- */
export const priorityLabels = {
  1: "גבוהה",
  2: "רגילה",
  3: "נמוכה",
} as const;

/* ---------------------------------------------------------------- *
 * Default option lists (used to seed selects / event & treatment types)
 * ---------------------------------------------------------------- */
export const DEFAULT_EVENT_TYPES = [
  "איחור חוזר",
  "היעדרות",
  "שיחה עם הבחור",
  "שיחה עם ההורים",
  "הישג חיובי",
  "אירוע משמעתי",
  "אירוע רפואי",
  "הערה כללית",
  "אחר",
] as const;

export const DEFAULT_TREATMENT_TYPES = [
  "מעקב אישי",
  "שיחת חיזוק",
  "מעורבות הורים",
  "ליווי לימודי",
  "התאמות מיוחדות",
  "הפניה לגורם מקצועי",
  "תוכנית משמעת",
  "אחר",
] as const;

/* ---------------------------------------------------------------- *
 * Date formatting — Hebrew (JEWISH) calendar
 * ----------------------------------------------------------------
 * כל התאריכים באפליקציה מוצגים בלוח העברי (כ״ז בתמוז תשפ״ו) ולא הלועזי.
 * הלוקאל "he-IL-u-ca-hebrew" מפעיל את הלוח העברי דרך Intl (ICU) — ללא צורך
 * בספריית-לוח חיצונית, ומחזיר שמות-חודשים וספרות עבריות (גימטריה) אוטומטית.
 * הערה: לשדות קלט (<input type="date">) עדיין נדרש ISO לועזי — אין להשתמש שם.
 */
const HEBREW_CALENDAR_LOCALE = "he-IL-u-ca-hebrew";

/* המרת מספר לגימטריה עם גרש/גרשיים — לימים (א׳..ל׳) ולשנים (תשפ״ו).
 * Intl מחזיר את שם-החודש העברי הנכון (כולל אדר א׳/ב׳ בשנה מעוברת) אך את היום
 * והשנה בספרות רגילות; כאן ממירים אותם לגימטריה כמקובל. שנים עבריות מוצגות
 * ללא האלפים (5786 → תשפ״ו), בדיוק כפי שנכתב בדוחות הישיבה. */
const GEMATRIA_HUNDREDS = ["", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק"];
const GEMATRIA_TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const GEMATRIA_ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];

export function toGematria(value: number): string {
  const n = value > 1000 ? value % 1000 : value;
  if (!Number.isFinite(n) || n <= 0) return String(value);
  let s = GEMATRIA_HUNDREDS[Math.floor(n / 100)] ?? "";
  const rem = n % 100;
  if (rem === 15) s += "טו"; // ט״ו — לא יה (שם ה׳)
  else if (rem === 16) s += "טז"; // ט״ז — לא יו
  else s += (GEMATRIA_TENS[Math.floor(rem / 10)] ?? "") + (GEMATRIA_ONES[rem % 10] ?? "");
  if (s.length <= 1) return s + "׳"; // גרש לאות בודדת
  return s.slice(0, -1) + "״" + s.slice(-1); // גרשיים לפני האות האחרונה
}

export function formatHebrewDate(
  d: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (d === null || d === undefined || d === "") return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  // Intl מפיק שם-חודש עברי נכון; אנו מחליפים יום ושנה בגימטריה (שעה/דקה נשארות).
  return new Intl.DateTimeFormat(
    HEBREW_CALENDAR_LOCALE,
    options ?? { day: "numeric", month: "long", year: "numeric" },
  )
    .formatToParts(date)
    .map((p) =>
      p.type === "day" || p.type === "year" ? toGematria(Number(p.value)) : p.value,
    )
    .join("");
}

export function formatHebrewDateTime(
  d: string | number | Date | null | undefined,
): string {
  return formatHebrewDate(d, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ---------------------------------------------------------------- *
 * Types
 * ---------------------------------------------------------------- */
export type AttendanceStatus = keyof typeof attendanceLabels;
export type StudentStatus = keyof typeof studentStatusLabels;
export type ReportStatus = keyof typeof reportStatusLabels;
export type TreatmentStatus = keyof typeof treatmentStatusLabels;
export type TaskStatus = keyof typeof taskStatusLabels;
export type Severity = keyof typeof severityLabels;
export type Role = keyof typeof roleLabels;
export type Priority = keyof typeof priorityLabels;
