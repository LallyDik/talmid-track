import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AttendanceStatus } from "@/lib/hebrew";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export interface DashboardFilters {
  /** Inclusive range start (local date). */
  from: Date;
  /** Inclusive range end (local date). */
  to: Date;
  /** class_id, or null for "all classes". */
  classId: string | null;
  /** study_session_id, or null for "all sessions". */
  sessionId: string | null;
  /** attendance_status, or null for "all statuses". */
  status: AttendanceStatus | null;
  /** staff member (profiles.id) for treatments/tasks, or null for all. */
  staffId: string | null;
}

export interface FilterOption {
  id: string;
  name: string;
}

export interface DashboardTiles {
  activeStudents: number;
  /** Present = on_time + late_b + late_c. */
  presentTodayByStudent: number;
  presentTodayBySession: number;
  lateTodayByStudent: number;
  lateTodayBySession: number;
  absentTodayByStudent: number;
  absentTodayBySession: number;
  openTreatments: number;
  overdueTasks: number;
  pendingReports: number;
}

export interface DayPoint {
  date: string;
  label: string;
  onTime: number;
  late: number;
  absent: number;
  rate: number;
}

export interface RatePoint {
  key: string;
  name: string;
  rate: number;
  attended: number;
  absent: number;
}

export interface WeekPoint {
  key: string;
  label: string;
  late: number;
}

export interface StudentCountPoint {
  id: string;
  name: string;
  count: number;
}

export interface MonthPoint {
  key: string;
  label: string;
  rate: number;
}

export interface DashboardCharts {
  byDay: DayPoint[];
  bySession: RatePoint[];
  byClass: RatePoint[];
  byWeek: WeekPoint[];
  topAbsent: StudentCountPoint[];
  topLate: StudentCountPoint[];
  byMonth: MonthPoint[];
}

export interface DashboardData {
  tiles: DashboardTiles;
  charts: DashboardCharts;
}

/* ------------------------------------------------------------------ *
 * Internal row shapes
 * ------------------------------------------------------------------ */

interface AttRow {
  report_date: string;
  attendance_status: AttendanceStatus;
  student_id: string;
  study_session_id: string;
  students: { id: string; full_name: string; class_id: string | null } | null;
}

interface TodayRow {
  attendance_status: AttendanceStatus;
  student_id: string;
  study_session_id: string;
}

/* ------------------------------------------------------------------ *
 * Date helpers (local, DATE-only — avoid UTC off-by-one)
 * ------------------------------------------------------------------ */

/** Format a Date as a local YYYY-MM-DD string. */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The local Sunday that starts the week containing `iso`, as YYYY-MM-DD. */
function weekStartKey(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - d.getDay()); // getDay(): 0 = Sunday
  return toISODate(d);
}

/* ------------------------------------------------------------------ *
 * Status sets
 * ------------------------------------------------------------------ */

const ATTENDED: ReadonlySet<AttendanceStatus> = new Set<AttendanceStatus>([
  "on_time",
  "late_b",
  "late_c",
]);
const LATE: ReadonlySet<AttendanceStatus> = new Set<AttendanceStatus>(["late_b", "late_c"]);

function rateOf(attended: number, absent: number): number {
  const denom = attended + absent;
  return denom > 0 ? Math.round((attended / denom) * 100) : 0;
}

/* ------------------------------------------------------------------ *
 * Paginated fetch — PostgREST caps a single response (usually 1000
 * rows), so page through until exhausted. Rebuild the query per page.
 * ------------------------------------------------------------------ */

async function fetchAll<T>(
  makeQuery: () => {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
  },
): Promise<T[]> {
  const PAGE = 1000;
  const MAX_PAGES = 40;
  const all: T[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const { data, error } = await makeQuery().range(p * PAGE, p * PAGE + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

/* ------------------------------------------------------------------ *
 * Filter options (classes / study sessions / staff) — stable, cached
 * independently of the active filters so the selects render at once.
 * ------------------------------------------------------------------ */

export function useDashboardFilterOptions(yeshivaId?: string) {
  return useQuery({
    queryKey: ["dashboard-filter-options", yeshivaId],
    enabled: !!yeshivaId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [classesRes, sessionsRes, staffRes] = await Promise.all([
        supabase
          .from("classes")
          .select("id, name")
          .eq("yeshiva_id", yeshivaId!)
          .order("name"),
        supabase
          .from("study_sessions")
          .select("id, name, order_index")
          .eq("yeshiva_id", yeshivaId!)
          .order("order_index"),
        supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("yeshiva_id", yeshivaId!)
          .order("full_name"),
      ]);
      if (classesRes.error) throw classesRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      if (staffRes.error) throw staffRes.error;

      const classes: FilterOption[] = (classesRes.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
      }));
      const sessions: FilterOption[] = (sessionsRes.data ?? []).map((s) => ({
        id: s.id,
        name: s.name,
      }));
      const staff: FilterOption[] = (staffRes.data ?? []).map((p) => ({
        id: p.id,
        name: p.full_name || p.email || "משתמש",
      }));
      return { classes, sessions, staff };
    },
  });
}

/* ------------------------------------------------------------------ *
 * Main dashboard data — one batched fetch feeding every tile & chart.
 * ------------------------------------------------------------------ */

export function useDashboardData(filters: DashboardFilters, yeshivaId?: string) {
  const fromStr = toISODate(filters.from);
  const toStr = toISODate(filters.to);
  const todayStr = toISODate(new Date());
  const { classId, sessionId, status, staffId } = filters;

  return useQuery<DashboardData>({
    queryKey: [
      "dashboard-data",
      yeshivaId,
      fromStr,
      toStr,
      todayStr,
      classId,
      sessionId,
      status,
      staffId,
    ],
    enabled: !!yeshivaId,
    queryFn: async () => {
      /* --- attendance in range (paginated), with student join --- */
      const attSelect =
        "report_date, attendance_status, student_id, study_session_id, students!inner(id, full_name, class_id)";
      const makeRangeQuery = () => {
        let q = supabase
          .from("attendance_records")
          .select(attSelect)
          .eq("yeshiva_id", yeshivaId!)
          .eq("is_draft", false)
          .is("deleted_at", null)
          .gte("report_date", fromStr)
          .lte("report_date", toStr);
        if (sessionId) q = q.eq("study_session_id", sessionId);
        if (classId) q = q.eq("students.class_id", classId);
        if (status) q = q.eq("attendance_status", status);
        return q;
      };

      /* --- attendance for today (tiles) --- */
      const makeTodayQuery = () => {
        if (classId) {
          let q = supabase
            .from("attendance_records")
            .select("attendance_status, student_id, study_session_id, students!inner(class_id)")
            .eq("yeshiva_id", yeshivaId!)
            .eq("is_draft", false)
            .is("deleted_at", null)
            .eq("report_date", todayStr)
            .eq("students.class_id", classId);
          if (sessionId) q = q.eq("study_session_id", sessionId);
          return q;
        }
        let q = supabase
          .from("attendance_records")
          .select("attendance_status, student_id, study_session_id")
          .eq("yeshiva_id", yeshivaId!)
          .eq("is_draft", false)
          .is("deleted_at", null)
          .eq("report_date", todayStr);
        if (sessionId) q = q.eq("study_session_id", sessionId);
        return q;
      };

      /* --- count queries --- */
      const activeStudentsQuery = () => {
        let q = supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("yeshiva_id", yeshivaId!)
          .eq("active", true);
        if (classId) q = q.eq("class_id", classId);
        return q;
      };

      const openTreatmentsQuery = () => {
        const sel = classId ? "id, students!inner(class_id)" : "id";
        let q = supabase
          .from("student_treatments")
          .select(sel, { count: "exact", head: true })
          .eq("yeshiva_id", yeshivaId!)
          .in("status", ["new", "in_progress", "waiting"]);
        if (staffId) q = q.eq("assigned_to", staffId);
        if (classId) q = q.eq("students.class_id", classId);
        return q;
      };

      const overdueTasksQuery = () => {
        const sel = classId ? "id, students!inner(class_id)" : "id";
        let q = supabase
          .from("tasks")
          .select(sel, { count: "exact", head: true })
          .eq("yeshiva_id", yeshivaId!)
          .in("status", ["open", "in_progress"])
          .lt("due_date", todayStr);
        if (staffId) q = q.eq("assigned_to", staffId);
        if (classId) q = q.eq("students.class_id", classId);
        return q;
      };

      const pendingReportsQuery = () => {
        let q = supabase
          .from("attendance_reports")
          .select("id", { count: "exact", head: true })
          .eq("yeshiva_id", yeshivaId!)
          .in("processing_status", ["pending", "processing", "needs_review"]);
        if (classId) q = q.eq("class_id", classId);
        if (sessionId) q = q.eq("study_session_id", sessionId);
        return q;
      };

      const [
        rangeRows,
        todayRows,
        classesRes,
        sessionsRes,
        activeStudentsRes,
        openTreatmentsRes,
        overdueTasksRes,
        pendingReportsRes,
      ] = await Promise.all([
        fetchAll<AttRow>(makeRangeQuery as unknown as () => ReturnType<typeof makeRangeQuery>),
        fetchAll<TodayRow>(makeTodayQuery as unknown as () => ReturnType<typeof makeTodayQuery>),
        supabase.from("classes").select("id, name").eq("yeshiva_id", yeshivaId!),
        supabase
          .from("study_sessions")
          .select("id, name, order_index")
          .eq("yeshiva_id", yeshivaId!),
        activeStudentsQuery(),
        openTreatmentsQuery(),
        overdueTasksQuery(),
        pendingReportsQuery(),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      if (activeStudentsRes.error) throw activeStudentsRes.error;
      if (openTreatmentsRes.error) throw openTreatmentsRes.error;
      if (overdueTasksRes.error) throw overdueTasksRes.error;
      if (pendingReportsRes.error) throw pendingReportsRes.error;

      const classNameById = new Map<string, string>(
        (classesRes.data ?? []).map((c) => [c.id, c.name]),
      );
      const sessionById = new Map<string, { name: string; order: number }>(
        (sessionsRes.data ?? []).map((s) => [s.id, { name: s.name, order: s.order_index }]),
      );

      /* --------------------- today tiles --------------------- */
      const presentStudents = new Set<string>();
      const lateStudents = new Set<string>();
      const absentStudents = new Set<string>();
      let presentRec = 0;
      let lateRec = 0;
      let absentRec = 0;
      for (const r of todayRows) {
        if (ATTENDED.has(r.attendance_status)) {
          presentRec++;
          presentStudents.add(r.student_id);
        }
        if (LATE.has(r.attendance_status)) {
          lateRec++;
          lateStudents.add(r.student_id);
        }
        if (r.attendance_status === "absent") {
          absentRec++;
          absentStudents.add(r.student_id);
        }
      }

      const tiles: DashboardTiles = {
        activeStudents: activeStudentsRes.count ?? 0,
        presentTodayByStudent: presentStudents.size,
        presentTodayBySession: presentRec,
        lateTodayByStudent: lateStudents.size,
        lateTodayBySession: lateRec,
        absentTodayByStudent: absentStudents.size,
        absentTodayBySession: absentRec,
        openTreatments: openTreatmentsRes.count ?? 0,
        overdueTasks: overdueTasksRes.count ?? 0,
        pendingReports: pendingReportsRes.count ?? 0,
      };

      /* --------------------- chart aggregations --------------------- */
      const dayMap = new Map<string, { onTime: number; late: number; absent: number }>();
      const sessionAgg = new Map<string, { attended: number; absent: number }>();
      const classAgg = new Map<string, { attended: number; absent: number }>();
      const weekMap = new Map<string, number>();
      const absentByStudent = new Map<string, { name: string; count: number }>();
      const lateByStudent = new Map<string, { name: string; count: number }>();
      const monthAgg = new Map<string, { attended: number; absent: number }>();

      for (const r of rangeRows) {
        const st = r.attendance_status;
        const isAttended = ATTENDED.has(st);
        const isLate = LATE.has(st);
        const isAbsent = st === "absent";

        // by day
        const dEntry = dayMap.get(r.report_date) ?? { onTime: 0, late: 0, absent: 0 };
        if (st === "on_time") dEntry.onTime++;
        else if (isLate) dEntry.late++;
        else if (isAbsent) dEntry.absent++;
        dayMap.set(r.report_date, dEntry);

        // by session
        if (isAttended || isAbsent) {
          const sEntry = sessionAgg.get(r.study_session_id) ?? { attended: 0, absent: 0 };
          if (isAttended) sEntry.attended++;
          else sEntry.absent++;
          sessionAgg.set(r.study_session_id, sEntry);
        }

        // by class
        const classKey = r.students?.class_id ?? "__none__";
        if (isAttended || isAbsent) {
          const cEntry = classAgg.get(classKey) ?? { attended: 0, absent: 0 };
          if (isAttended) cEntry.attended++;
          else cEntry.absent++;
          classAgg.set(classKey, cEntry);
        }

        // by week (lates)
        if (isLate) {
          const wk = weekStartKey(r.report_date);
          weekMap.set(wk, (weekMap.get(wk) ?? 0) + 1);
        }

        // by month (rate)
        if (isAttended || isAbsent) {
          const mk = r.report_date.slice(0, 7); // YYYY-MM
          const mEntry = monthAgg.get(mk) ?? { attended: 0, absent: 0 };
          if (isAttended) mEntry.attended++;
          else mEntry.absent++;
          monthAgg.set(mk, mEntry);
        }

        // top absentees / latecomers
        const name = r.students?.full_name ?? "בחור";
        if (isAbsent) {
          const a = absentByStudent.get(r.student_id) ?? { name, count: 0 };
          a.count++;
          absentByStudent.set(r.student_id, a);
        }
        if (isLate) {
          const l = lateByStudent.get(r.student_id) ?? { name, count: 0 };
          l.count++;
          lateByStudent.set(r.student_id, l);
        }
      }

      const byDay: DayPoint[] = [...dayMap.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([date, v]) => ({
          date,
          label: fmtDayLabel(date),
          onTime: v.onTime,
          late: v.late,
          absent: v.absent,
          rate: rateOf(v.onTime + v.late, v.absent),
        }));

      const bySession: RatePoint[] = [...sessionAgg.entries()]
        .map(([id, v]) => ({
          key: id,
          name: sessionById.get(id)?.name ?? "סדר",
          order: sessionById.get(id)?.order ?? 999,
          rate: rateOf(v.attended, v.absent),
          attended: v.attended,
          absent: v.absent,
        }))
        .sort((a, b) => a.order - b.order)
        .map(({ key, name, rate, attended, absent }) => ({ key, name, rate, attended, absent }));

      const byClass: RatePoint[] = [...classAgg.entries()]
        .map(([id, v]) => ({
          key: id,
          name: id === "__none__" ? "ללא שיעור" : (classNameById.get(id) ?? "שיעור"),
          rate: rateOf(v.attended, v.absent),
          attended: v.attended,
          absent: v.absent,
        }))
        .sort((a, b) => b.rate - a.rate);

      const byWeek: WeekPoint[] = [...weekMap.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([key, late]) => ({ key, label: fmtDayLabel(key), late }));

      const byMonth: MonthPoint[] = [...monthAgg.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([key, v]) => ({ key, label: fmtMonthLabel(key), rate: rateOf(v.attended, v.absent) }));

      const topAbsent: StudentCountPoint[] = [...absentByStudent.entries()]
        .map(([id, v]) => ({ id, name: v.name, count: v.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const topLate: StudentCountPoint[] = [...lateByStudent.entries()]
        .map(([id, v]) => ({ id, name: v.name, count: v.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        tiles,
        charts: { byDay, bySession, byClass, byWeek, topAbsent, topLate, byMonth },
      };
    },
  });
}

/* ------------------------------------------------------------------ *
 * Label formatting (Hebrew)
 * ------------------------------------------------------------------ */

function fmtDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  // לוח עברי (כ״ז תמוז) — עקבי עם שאר התאריכים באפליקציה.
  return d.toLocaleDateString("he-IL-u-ca-hebrew", { day: "numeric", month: "short" });
}

function fmtMonthLabel(key: string): string {
  const d = new Date(`${key}-01T00:00:00`);
  return d.toLocaleDateString("he-IL-u-ca-hebrew", { month: "long", year: "numeric" });
}
