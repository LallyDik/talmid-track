/**
 * Shared hooks, helpers and types for the individual student card
 * (src/routes/_authenticated/students.$id.tsx and the per-tab components).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { AttendanceStatus } from "@/lib/hebrew";

/* ---------------------------------------------------------------- *
 * Types
 * ---------------------------------------------------------------- */
export type Student = Tables<"students">;

export type AttendanceRecordRow = Tables<"attendance_records"> & {
  study_sessions: { name: string; order_index: number } | null;
};

export type StudySession = Pick<
  Tables<"study_sessions">,
  "id" | "name" | "order_index"
>;

export interface StaffMember {
  id: string;
  full_name: string | null;
  email: string | null;
}

/* ---------------------------------------------------------------- *
 * Status color map — maps each attendance status to its CSS variable
 * so calendar dots / cells can be tinted inline.
 * ---------------------------------------------------------------- */
export const statusColorVar: Record<AttendanceStatus, string> = {
  on_time: "var(--status-on-time)",
  late_b: "var(--status-late-b)",
  late_c: "var(--status-late-c)",
  absent: "var(--status-absent)",
  excused: "var(--status-excused)",
  unknown: "var(--status-unknown)",
};

/* ---------------------------------------------------------------- *
 * Data hooks
 * ---------------------------------------------------------------- */

/**
 * Non-draft, non-deleted attendance records for a student. Shared between the
 * header aggregates and the נוכחות tab (react-query dedupes the identical key).
 */
export function useStudentAttendance(studentId: string) {
  return useQuery({
    queryKey: ["student-attendance", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("*, study_sessions(name, order_index)")
        .eq("student_id", studentId)
        .eq("is_draft", false)
        .is("deleted_at", null)
        .order("report_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttendanceRecordRow[];
    },
  });
}

/** Active study sessions for the tenant, ordered by their study order. */
export function useStudySessions(yeshivaId?: string) {
  return useQuery({
    queryKey: ["study-sessions", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("study_sessions")
        .select("id, name, order_index")
        .eq("active", true)
        .order("order_index");
      if (error) throw error;
      return (data ?? []) as StudySession[];
    },
  });
}

/** Staff members (profiles) in the tenant — powers assignee pickers. */
export function useStaff(yeshivaId?: string) {
  return useQuery({
    queryKey: ["staff", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("yeshiva_id", yeshivaId!)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as StaffMember[];
    },
  });
}

/** Classes for the tenant — used by the details form class picker. */
export function useClasses(yeshivaId?: string) {
  return useQuery({
    queryKey: ["classes-picker", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
}

/* ---------------------------------------------------------------- *
 * Small pure helpers
 * ---------------------------------------------------------------- */

export const NONE = "__none__";

/** Today as an ISO date string (YYYY-MM-DD), local time. */
export function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

/** True when a due date is strictly before today and the item is still open. */
export function isOverdue(dueDate: string | null, done: boolean): boolean {
  if (!dueDate || done) return false;
  return dueDate < todayISO();
}

/** Human readable file size in Hebrew-friendly units. */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Resolve a user id to a display name using the staff list. */
export function staffName(
  staff: StaffMember[] | undefined,
  id: string | null | undefined,
): string {
  if (!id) return "—";
  const m = staff?.find((s) => s.id === id);
  return m?.full_name || m?.email || "משתמש";
}
