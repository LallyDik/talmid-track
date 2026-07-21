/**
 * Alerts Engine
 * שכבת שירות נקייה, מנותקת מ-UI, להרצת חוקי התראות על נתוני הישיבה.
 * המנוע מריץ כל חוק מאופשר מול הנתונים ומכניס שורות לטבלת alerts,
 * מבלי לשכפל התראה פתוחה קיימת עבור אותו בחור + חוק + חלון זמן.
 *
 * העיצוב מקביל ל-attendanceDocumentProcessor: תיאורי החוקים (descriptors)
 * מוגדרים באופן דקלרטיבי כך שמסך ההגדרות יכול לרנדר אותם באופן גנרי,
 * וניתן להחליף/להרחיב חוקים בלי לגעת בשאר המערכת.
 *
 * חשוב: חוקים מבוססי נוכחות קוראים אך ורק רשומות עם
 * is_draft = false AND deleted_at IS NULL.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { formatHebrewDate } from "@/lib/hebrew";

type Severity = Database["public"]["Enums"]["event_severity"];
type AttendanceStatus = Database["public"]["Enums"]["attendance_status"];

/* ---------------------------------------------------------------- *
 * Rule descriptors — the swappable, declarative rule catalogue.
 * מסך ההגדרות מייבא את alertRuleDescriptors ומרנדר אותם גנרית.
 * ---------------------------------------------------------------- */

export type AlertRuleKey =
  | "absent_consecutive_sessions"
  | "absent_weekly"
  | "late_monthly"
  | "attendance_drop"
  | "treatment_overdue"
  | "task_overdue"
  | "report_unapproved";

export type AlertRuleCategory = "attendance" | "treatment" | "task" | "report";

export interface AlertRuleDescriptor {
  key: AlertRuleKey;
  /** כותרת קצרה בעברית (לשימוש בכרטיס ההתראה ובמסך ההגדרות). */
  title: string;
  /** הסבר בעברית לחוק — נועד למסך ההגדרות. */
  description: string;
  category: AlertRuleCategory;
  severity: Severity;
  /** ערך סף ברירת מחדל (null אם לחוק אין סף מספרי). */
  defaultThreshold: number | null;
  /** חלון זמן בימים לברירת מחדל (null אם אינו רלוונטי). */
  defaultWindow: number | null;
  /** תווית שדה הסף למסך ההגדרות (null אם אין סף). */
  thresholdLabel: string | null;
  /** תווית שדה חלון הזמן למסך ההגדרות (null אם אין). */
  windowLabel: string | null;
}

export const alertRuleDescriptors: AlertRuleDescriptor[] = [
  {
    key: "absent_consecutive_sessions",
    title: "היעדרות מסדרים רצופים",
    description:
      "בחור שנעדר ממספר סדרים רצופים לאחרונה. מספר הסדרים הרצופים ניתן להגדרה.",
    category: "attendance",
    severity: "high",
    defaultThreshold: 2,
    defaultWindow: 14,
    thresholdLabel: "מספר סדרים רצופים",
    windowLabel: "חלון בדיקה (ימים)",
  },
  {
    key: "absent_weekly",
    title: "היעדרויות מרובות בשבוע",
    description: "בחור שנעדר שלוש פעמים או יותר בתוך שבוע.",
    category: "attendance",
    severity: "high",
    defaultThreshold: 3,
    defaultWindow: 7,
    thresholdLabel: "מספר היעדרויות",
    windowLabel: "חלון (ימים)",
  },
  {
    key: "late_monthly",
    title: "איחורים מרובים בחודש",
    description: "בחור שאיחר ארבע פעמים או יותר בתוך חודש.",
    category: "attendance",
    severity: "medium",
    defaultThreshold: 4,
    defaultWindow: 30,
    thresholdLabel: "מספר איחורים",
    windowLabel: "חלון (ימים)",
  },
  {
    key: "attendance_drop",
    title: "ירידה באחוז הנוכחות",
    description:
      "בחור עם ירידה משמעותית באחוז הנוכחות בהשוואה בין החלון האחרון לחלון הקודם לו. הסף נמדד בנקודות אחוז.",
    category: "attendance",
    severity: "high",
    defaultThreshold: 20,
    defaultWindow: 30,
    thresholdLabel: "ירידה בנקודות אחוז",
    windowLabel: "אורך חלון ההשוואה (ימים)",
  },
  {
    key: "treatment_overdue",
    title: "טיפול שעבר את תאריך היעד",
    description: "טיפול פתוח שתאריך היעד שלו חלף ועדיין לא הושלם.",
    category: "treatment",
    severity: "high",
    defaultThreshold: 0,
    defaultWindow: null,
    thresholdLabel: "ימי חסד",
    windowLabel: null,
  },
  {
    key: "task_overdue",
    title: "משימה שלא הושלמה בזמן",
    description: "משימה פתוחה שתאריך היעד שלה חלף ועדיין לא הושלמה.",
    category: "task",
    severity: "medium",
    defaultThreshold: 0,
    defaultWindow: null,
    thresholdLabel: "ימי חסד",
    windowLabel: null,
  },
  {
    key: "report_unapproved",
    title: "דוח שלא אושר",
    description:
      "דוח נוכחות שהועלה אך לא אושר במשך מספר ימים מוגדר מאז ההעלאה.",
    category: "report",
    severity: "low",
    defaultThreshold: 3,
    defaultWindow: null,
    thresholdLabel: "ימים מאז ההעלאה",
    windowLabel: null,
  },
];

export const alertRuleDescriptorMap: Record<AlertRuleKey, AlertRuleDescriptor> =
  Object.fromEntries(alertRuleDescriptors.map((d) => [d.key, d])) as Record<
    AlertRuleKey,
    AlertRuleDescriptor
  >;

/* ---------------------------------------------------------------- *
 * Public contract
 * ---------------------------------------------------------------- */

export interface AlertRuleConfig {
  rule_key: string;
  enabled: boolean;
  threshold: number | null;
  window_days: number | null;
}

export interface EvaluateAlertsContext {
  yeshivaId: string;
  /** נקודת זמן להרצה (ברירת מחדל: עכשיו). מאפשר בדיקות דטרמיניסטיות. */
  now?: Date;
  /** קונפיגורציית חוקים טעונה מראש; אם לא נמסרת — נטענת מטבלת alert_rules. */
  rules?: AlertRuleConfig[];
}

export interface EvaluateAlertsResult {
  created: number;
  createdByRule: Partial<Record<AlertRuleKey, number>>;
  evaluatedRules: AlertRuleKey[];
}

/** מבנה פנימי של התראה מועמדת לפני הכנסה למסד. */
interface RaisedAlert {
  rule_key: AlertRuleKey;
  title: string;
  body: string;
  severity: Severity;
  student_id?: string | null;
  treatment_id?: string | null;
  task_id?: string | null;
  report_id?: string | null;
}

/* ---------------------------------------------------------------- *
 * Date helpers (local time — matches how report_date/due_date are stored)
 * ---------------------------------------------------------------- */

function dateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/* ---------------------------------------------------------------- *
 * Internal record shapes
 * ---------------------------------------------------------------- */

interface AttRecord {
  student_id: string;
  attendance_status: AttendanceStatus;
  report_date: string; // YYYY-MM-DD
  order_index: number; // seder order for consecutive detection
}

const PRESENT_STATUSES: AttendanceStatus[] = [
  "on_time",
  "late_b",
  "late_c",
  "excused",
];
const LATE_STATUSES: AttendanceStatus[] = ["late_b", "late_c"];

function attendanceRate(recs: AttRecord[]): number | null {
  if (recs.length === 0) return null;
  const present = recs.filter((r) =>
    PRESENT_STATUSES.includes(r.attendance_status),
  ).length;
  return Math.round((present / recs.length) * 100);
}

/* ---------------------------------------------------------------- *
 * Config resolution
 * ---------------------------------------------------------------- */

interface ResolvedRule {
  descriptor: AlertRuleDescriptor;
  enabled: boolean;
  threshold: number | null;
  window: number | null;
}

function resolveRules(configs: AlertRuleConfig[]): ResolvedRule[] {
  const byKey = new Map(configs.map((c) => [c.rule_key, c]));
  return alertRuleDescriptors.map((descriptor) => {
    const cfg = byKey.get(descriptor.key);
    return {
      descriptor,
      // חוק ללא שורת קונפיגורציה נחשב מאופשר כברירת מחדל.
      enabled: cfg ? cfg.enabled : true,
      threshold: cfg?.threshold ?? descriptor.defaultThreshold,
      window: cfg?.window_days ?? descriptor.defaultWindow,
    };
  });
}

/* ---------------------------------------------------------------- *
 * Attendance rule evaluators (pure — operate on in-memory data)
 * ---------------------------------------------------------------- */

function evalAbsentConsecutive(
  byStudent: Map<string, AttRecord[]>,
  studentName: (id: string) => string,
  rule: ResolvedRule,
  now: Date,
): RaisedAlert[] {
  const threshold = Math.max(1, rule.threshold ?? 2);
  const windowDays = rule.window ?? 14;
  const cutoff = dateStr(addDays(now, -windowDays));
  const out: RaisedAlert[] = [];

  for (const [studentId, recs] of byStudent) {
    const recent = recs.filter((r) => r.report_date >= cutoff);
    if (recent.length < threshold) continue;
    const topN = recent.slice(0, threshold); // already sorted newest-first
    if (topN.every((r) => r.attendance_status === "absent")) {
      out.push({
        rule_key: rule.descriptor.key,
        severity: rule.descriptor.severity,
        title: `${rule.descriptor.title} — ${studentName(studentId)}`,
        body: `הבחור נעדר מ-${threshold} סדרים רצופים לאחרונה.`,
        student_id: studentId,
      });
    }
  }
  return out;
}

function evalAbsentWeekly(
  byStudent: Map<string, AttRecord[]>,
  studentName: (id: string) => string,
  rule: ResolvedRule,
  now: Date,
): RaisedAlert[] {
  const threshold = Math.max(1, rule.threshold ?? 3);
  const windowDays = rule.window ?? 7;
  const cutoff = dateStr(addDays(now, -windowDays));
  const out: RaisedAlert[] = [];

  for (const [studentId, recs] of byStudent) {
    const count = recs.filter(
      (r) => r.report_date >= cutoff && r.attendance_status === "absent",
    ).length;
    if (count >= threshold) {
      out.push({
        rule_key: rule.descriptor.key,
        severity: rule.descriptor.severity,
        title: `${rule.descriptor.title} — ${studentName(studentId)}`,
        body: `הבחור נעדר ${count} פעמים ב-${windowDays} הימים האחרונים.`,
        student_id: studentId,
      });
    }
  }
  return out;
}

function evalLateMonthly(
  byStudent: Map<string, AttRecord[]>,
  studentName: (id: string) => string,
  rule: ResolvedRule,
  now: Date,
): RaisedAlert[] {
  const threshold = Math.max(1, rule.threshold ?? 4);
  const windowDays = rule.window ?? 30;
  const cutoff = dateStr(addDays(now, -windowDays));
  const out: RaisedAlert[] = [];

  for (const [studentId, recs] of byStudent) {
    const count = recs.filter(
      (r) =>
        r.report_date >= cutoff && LATE_STATUSES.includes(r.attendance_status),
    ).length;
    if (count >= threshold) {
      out.push({
        rule_key: rule.descriptor.key,
        severity: rule.descriptor.severity,
        title: `${rule.descriptor.title} — ${studentName(studentId)}`,
        body: `הבחור איחר ${count} פעמים ב-${windowDays} הימים האחרונים.`,
        student_id: studentId,
      });
    }
  }
  return out;
}

function evalAttendanceDrop(
  byStudent: Map<string, AttRecord[]>,
  studentName: (id: string) => string,
  rule: ResolvedRule,
  now: Date,
): RaisedAlert[] {
  const threshold = Math.max(1, rule.threshold ?? 20);
  const windowDays = rule.window ?? 30;
  const MIN_SAMPLE = 3;
  const trailingStart = dateStr(addDays(now, -windowDays));
  const priorStart = dateStr(addDays(now, -2 * windowDays));
  const out: RaisedAlert[] = [];

  for (const [studentId, recs] of byStudent) {
    const trailing = recs.filter((r) => r.report_date >= trailingStart);
    const prior = recs.filter(
      (r) => r.report_date >= priorStart && r.report_date < trailingStart,
    );
    if (trailing.length < MIN_SAMPLE || prior.length < MIN_SAMPLE) continue;

    const trailingRate = attendanceRate(trailing);
    const priorRate = attendanceRate(prior);
    if (trailingRate === null || priorRate === null) continue;

    const drop = priorRate - trailingRate;
    if (drop >= threshold) {
      out.push({
        rule_key: rule.descriptor.key,
        severity: rule.descriptor.severity,
        title: `${rule.descriptor.title} — ${studentName(studentId)}`,
        body: `אחוז הנוכחות ירד מ-${priorRate}% ל-${trailingRate}% (ירידה של ${drop} נקודות אחוז).`,
        student_id: studentId,
      });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- *
 * Deduplication key — one open alert per rule + linked entity.
 * ---------------------------------------------------------------- */

function refKey(a: {
  rule_key: string;
  student_id?: string | null;
  treatment_id?: string | null;
  task_id?: string | null;
  report_id?: string | null;
}): string {
  return [
    a.rule_key,
    a.student_id ?? "",
    a.treatment_id ?? "",
    a.task_id ?? "",
    a.report_id ?? "",
  ].join("|");
}

/* ---------------------------------------------------------------- *
 * Main entry point
 * ---------------------------------------------------------------- */

/**
 * מריץ את כל החוקים המאופשרים ומכניס התראות חדשות לטבלת alerts.
 * לא משכפל התראה פתוחה קיימת עבור אותו חוק + ישות מקושרת.
 * מחזיר את מספר ההתראות שנוצרו ופירוט לפי חוק.
 */
export async function evaluateAlerts(
  ctx: EvaluateAlertsContext,
): Promise<EvaluateAlertsResult> {
  const { yeshivaId } = ctx;
  const now = ctx.now ?? new Date();
  const today = dateStr(now);

  // 1. Resolve rule configuration.
  let configs = ctx.rules;
  if (!configs) {
    const { data, error } = await supabase
      .from("alert_rules")
      .select("rule_key, enabled, threshold, window_days")
      .eq("yeshiva_id", yeshivaId);
    if (error) throw error;
    configs = data ?? [];
  }
  const resolved = resolveRules(configs).filter((r) => r.enabled);
  const enabledKeys = new Set(resolved.map((r) => r.descriptor.key));

  const candidates: RaisedAlert[] = [];

  // 2. Attendance-based rules — one shared data load.
  const attendanceRules = resolved.filter(
    (r) => r.descriptor.category === "attendance",
  );
  if (attendanceRules.length > 0) {
    const lookback = Math.max(
      ...attendanceRules.map((r) => {
        if (r.descriptor.key === "attendance_drop") return (r.window ?? 30) * 2;
        return r.window ?? 30;
      }),
    );
    const earliest = dateStr(addDays(now, -lookback));

    const [
      { data: students, error: sErr },
      { data: sessions, error: ssErr },
      { data: records, error: rErr },
    ] = await Promise.all([
      supabase
        .from("students")
        .select("id, full_name, active")
        .eq("yeshiva_id", yeshivaId),
      supabase
        .from("study_sessions")
        .select("id, order_index")
        .eq("yeshiva_id", yeshivaId),
      supabase
        .from("attendance_records")
        .select("student_id, attendance_status, report_date, study_session_id")
        .eq("yeshiva_id", yeshivaId)
        .eq("is_draft", false)
        .is("deleted_at", null)
        .gte("report_date", earliest),
    ]);
    if (sErr) throw sErr;
    if (ssErr) throw ssErr;
    if (rErr) throw rErr;

    const orderById = new Map(
      (sessions ?? []).map((s) => [s.id, s.order_index ?? 0]),
    );
    const nameById = new Map(
      (students ?? []).map((s) => [s.id, s.full_name as string]),
    );
    const activeIds = new Set(
      (students ?? []).filter((s) => s.active !== false).map((s) => s.id),
    );
    const studentName = (id: string) => nameById.get(id) ?? "בחור";

    // Group active students' records, newest-first (date desc, then seder desc).
    const byStudent = new Map<string, AttRecord[]>();
    for (const r of records ?? []) {
      if (!activeIds.has(r.student_id)) continue;
      const rec: AttRecord = {
        student_id: r.student_id,
        attendance_status: r.attendance_status,
        report_date: r.report_date,
        order_index: orderById.get(r.study_session_id) ?? 0,
      };
      const arr = byStudent.get(r.student_id);
      if (arr) arr.push(rec);
      else byStudent.set(r.student_id, [rec]);
    }
    for (const arr of byStudent.values()) {
      arr.sort((a, b) => {
        if (a.report_date !== b.report_date)
          return a.report_date < b.report_date ? 1 : -1;
        return b.order_index - a.order_index;
      });
    }

    for (const rule of attendanceRules) {
      switch (rule.descriptor.key) {
        case "absent_consecutive_sessions":
          candidates.push(
            ...evalAbsentConsecutive(byStudent, studentName, rule, now),
          );
          break;
        case "absent_weekly":
          candidates.push(
            ...evalAbsentWeekly(byStudent, studentName, rule, now),
          );
          break;
        case "late_monthly":
          candidates.push(...evalLateMonthly(byStudent, studentName, rule, now));
          break;
        case "attendance_drop":
          candidates.push(
            ...evalAttendanceDrop(byStudent, studentName, rule, now),
          );
          break;
      }
    }
  }

  // 3. Treatment overdue.
  const treatmentRule = resolved.find(
    (r) => r.descriptor.key === "treatment_overdue",
  );
  if (treatmentRule) {
    const grace = treatmentRule.threshold ?? 0;
    const cutoff = dateStr(addDays(now, -grace));
    const { data, error } = await supabase
      .from("student_treatments")
      .select("id, title, student_id, due_date")
      .eq("yeshiva_id", yeshivaId)
      .neq("status", "completed")
      .neq("status", "cancelled")
      .not("due_date", "is", null)
      .lt("due_date", cutoff);
    if (error) throw error;
    for (const t of data ?? []) {
      candidates.push({
        rule_key: treatmentRule.descriptor.key,
        severity: treatmentRule.descriptor.severity,
        title: `${treatmentRule.descriptor.title}`,
        body: `הטיפול "${t.title}" חלף את תאריך היעד (${formatHebrewDate(
          t.due_date,
        )}) ועדיין פתוח.`,
        student_id: t.student_id,
        treatment_id: t.id,
      });
    }
  }

  // 4. Task overdue.
  const taskRule = resolved.find((r) => r.descriptor.key === "task_overdue");
  if (taskRule) {
    const grace = taskRule.threshold ?? 0;
    const cutoff = dateStr(addDays(now, -grace));
    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, student_id, due_date")
      .eq("yeshiva_id", yeshivaId)
      .neq("status", "completed")
      .neq("status", "cancelled")
      .not("due_date", "is", null)
      .lt("due_date", cutoff);
    if (error) throw error;
    for (const t of data ?? []) {
      candidates.push({
        rule_key: taskRule.descriptor.key,
        severity: taskRule.descriptor.severity,
        title: `${taskRule.descriptor.title}`,
        body: `המשימה "${t.title}" לא הושלמה עד תאריך היעד (${formatHebrewDate(
          t.due_date,
        )}).`,
        student_id: t.student_id,
        task_id: t.id,
      });
    }
  }

  // 5. Report unapproved.
  const reportRule = resolved.find(
    (r) => r.descriptor.key === "report_unapproved",
  );
  if (reportRule) {
    const days = reportRule.threshold ?? 3;
    const cutoffTs = addDays(now, -days).toISOString();
    const { data, error } = await supabase
      .from("attendance_reports")
      .select("id, report_date, uploaded_at, processing_status")
      .eq("yeshiva_id", yeshivaId)
      .in("processing_status", ["pending", "processing", "needs_review"])
      .lt("uploaded_at", cutoffTs);
    if (error) throw error;
    for (const rep of data ?? []) {
      candidates.push({
        rule_key: reportRule.descriptor.key,
        severity: reportRule.descriptor.severity,
        title: `${reportRule.descriptor.title}`,
        body: `הדוח מתאריך ${formatHebrewDate(
          rep.report_date,
        )} הועלה אך טרם אושר במשך ${days} ימים לפחות.`,
        report_id: rep.id,
      });
    }
  }

  // 6. Deduplicate against existing OPEN alerts and among candidates.
  const { data: openAlerts, error: oErr } = await supabase
    .from("alerts")
    .select("rule_key, student_id, treatment_id, task_id, report_id")
    .eq("yeshiva_id", yeshivaId)
    .eq("status", "open");
  if (oErr) throw oErr;

  const seen = new Set((openAlerts ?? []).map(refKey));
  const toInsert: RaisedAlert[] = [];
  for (const c of candidates) {
    const key = refKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    toInsert.push(c);
  }

  // 7. Insert.
  if (toInsert.length > 0) {
    const rows = toInsert.map((c) => ({
      yeshiva_id: yeshivaId,
      rule_key: c.rule_key,
      title: c.title,
      body: c.body,
      severity: c.severity,
      status: "open",
      student_id: c.student_id ?? null,
      treatment_id: c.treatment_id ?? null,
      task_id: c.task_id ?? null,
      report_id: c.report_id ?? null,
    }));
    const { error } = await supabase.from("alerts").insert(rows);
    if (error) throw error;
  }

  const createdByRule: Partial<Record<AlertRuleKey, number>> = {};
  for (const c of toInsert) {
    createdByRule[c.rule_key] = (createdByRule[c.rule_key] ?? 0) + 1;
  }

  return {
    created: toInsert.length,
    createdByRule,
    evaluatedRules: [...enabledKeys],
  };
}

/* ---------------------------------------------------------------- *
 * Helper for a future AppShell unresolved-count badge.
 * ---------------------------------------------------------------- */

/** מחזיר את מספר ההתראות הפתוחות (status = 'open') לישיבה. */
export async function getOpenAlertsCount(yeshivaId: string): Promise<number> {
  const { count, error } = await supabase
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .eq("yeshiva_id", yeshivaId)
    .eq("status", "open");
  if (error) throw error;
  return count ?? 0;
}

/** מפתח שאילתה משותף לספירת התראות פתוחות (לשימוש עתידי ב-AppShell). */
export const openAlertsCountQueryKey = (yeshivaId?: string) =>
  ["alerts", "open-count", yeshivaId] as const;
