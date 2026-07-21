import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AttendanceStatus } from "@/lib/hebrew";

/**
 * Per-student aggregated attendance / treatment / event statistics.
 *
 * Attendance rate is defined as (on_time + late_b + late_c) / total — i.e. an
 * arrival that was late still counts as "present". The numerator parts are
 * exposed separately so the UI can show a tooltip explaining that.
 */
export interface StudentStats {
  /** All non-draft, non-deleted attendance records for the student. */
  total: number;
  onTime: number;
  lateB: number;
  lateC: number;
  /** lateB + lateC */
  late: number;
  absent: number;
  excused: number;
  unknown: number;
  /** onTime + lateB + lateC — the rate numerator. */
  present: number;
  /** Attendance rate as an integer percentage 0..100 (0 when total === 0). */
  rate: number;
  /** Treatments whose status is not completed / cancelled. */
  openTreatments: number;
  /** Most recent student event, or null. */
  lastEvent: { date: string; title: string } | null;
}

export interface UseStudentStatsResult {
  /** Map keyed by student id. Students with no data are simply absent. */
  stats: Map<string, StudentStats>;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

/** A zeroed stats object for students that have no aggregated data yet. */
export const EMPTY_STUDENT_STATS: StudentStats = {
  total: 0,
  onTime: 0,
  lateB: 0,
  lateC: 0,
  late: 0,
  absent: 0,
  excused: 0,
  unknown: 0,
  present: 0,
  rate: 0,
  openTreatments: 0,
  lastEvent: null,
};

const PAGE = 1000;

interface RangeResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Reads every row a query can return by paging with `.range()`, so a single
 * logical query is never silently truncated at Supabase's 1000-row default.
 */
async function fetchAll<T>(
  makeQuery: (from: number, to: number) => PromiseLike<RangeResult<T>>,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // Hard cap so a misbehaving backend can never spin forever.
  for (let guard = 0; guard < 1000; guard++) {
    const { data, error } = await makeQuery(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

interface RecordRow {
  student_id: string;
  attendance_status: AttendanceStatus;
}
interface TreatmentRow {
  student_id: string;
}
interface EventRow {
  student_id: string;
  event_date: string;
  title: string;
}

async function loadStats(yeshivaId: string): Promise<Map<string, StudentStats>> {
  // Three batched, ranged queries fired in parallel — never one query per
  // student. Only unapproved-OCR-free (is_draft = false) and non-deleted
  // (deleted_at IS NULL) records are allowed to affect the numbers.
  const [records, treatments, events] = await Promise.all([
    fetchAll<RecordRow>((from, to) =>
      supabase
        .from("attendance_records")
        .select("student_id, attendance_status")
        .eq("yeshiva_id", yeshivaId)
        .eq("is_draft", false)
        .is("deleted_at", null)
        .range(from, to),
    ),
    fetchAll<TreatmentRow>((from, to) =>
      supabase
        .from("student_treatments")
        .select("student_id")
        .eq("yeshiva_id", yeshivaId)
        .not("status", "in", "(completed,cancelled)")
        .range(from, to),
    ),
    fetchAll<EventRow>((from, to) =>
      supabase
        .from("student_events")
        .select("student_id, event_date, title")
        .eq("yeshiva_id", yeshivaId)
        .order("event_date", { ascending: false })
        .range(from, to),
    ),
  ]);

  const stats = new Map<string, StudentStats>();
  const ensure = (id: string): StudentStats => {
    let s = stats.get(id);
    if (!s) {
      s = { ...EMPTY_STUDENT_STATS, lastEvent: null };
      stats.set(id, s);
    }
    return s;
  };

  for (const r of records) {
    const s = ensure(r.student_id);
    s.total += 1;
    switch (r.attendance_status) {
      case "on_time":
        s.onTime += 1;
        break;
      case "late_b":
        s.lateB += 1;
        break;
      case "late_c":
        s.lateC += 1;
        break;
      case "absent":
        s.absent += 1;
        break;
      case "excused":
        s.excused += 1;
        break;
      default:
        s.unknown += 1;
    }
  }

  for (const t of treatments) {
    ensure(t.student_id).openTreatments += 1;
  }

  // Events arrive newest-first (globally ordered across pages), so the first
  // time we see a student is their most recent event.
  for (const e of events) {
    const s = ensure(e.student_id);
    if (!s.lastEvent) s.lastEvent = { date: e.event_date, title: e.title };
  }

  for (const s of stats.values()) {
    s.late = s.lateB + s.lateC;
    s.present = s.onTime + s.lateB + s.lateC;
    s.rate = s.total > 0 ? Math.round((s.present / s.total) * 100) : 0;
  }

  return stats;
}

/**
 * Loads aggregated stats for every student in the tenant in a handful of
 * batched queries, cached by yeshiva so it survives list filter/sort changes.
 */
export function useStudentStats(yeshivaId?: string): UseStudentStatsResult {
  const query = useQuery({
    queryKey: ["student-stats", yeshivaId],
    enabled: !!yeshivaId,
    staleTime: 60_000,
    queryFn: () => loadStats(yeshivaId!),
  });

  return {
    stats: query.data ?? new Map<string, StudentStats>(),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}
