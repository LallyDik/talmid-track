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

export const studentStatusLabels = {
  active: "פעיל",
  inactive: "לא פעיל",
  vacation: "בחופשה",
  left: "עזב",
  suspended: "הושהה",
} as const;

export const reportStatusLabels = {
  pending: "ממתין",
  processing: "בעיבוד",
  needs_review: "דורש בדיקה",
  approved: "אושר",
  failed: "נכשל",
} as const;

export type AttendanceStatus = keyof typeof attendanceLabels;
export type StudentStatus = keyof typeof studentStatusLabels;
export type ReportStatus = keyof typeof reportStatusLabels;