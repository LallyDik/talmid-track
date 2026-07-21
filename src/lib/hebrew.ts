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
 * Date formatting (Hebrew, he-IL)
 * ---------------------------------------------------------------- */
export function formatHebrewDate(
  d: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (d === null || d === undefined || d === "") return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(
    "he-IL",
    options ?? { day: "numeric", month: "long", year: "numeric" },
  ).format(date);
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
