import type { Database } from "@/integrations/supabase/types";
import type { TaskStatus } from "@/lib/hebrew";

/** רשומת משימה כפי שהיא נטענת עם השדות המקושרים. */
export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"] & {
  students?: { full_name: string } | null;
  student_treatments?: { title: string } | null;
};

export interface StaffOption {
  id: string;
  full_name: string;
}

export interface StudentOption {
  id: string;
  full_name: string;
}

export interface TreatmentOption {
  id: string;
  title: string;
  student_id: string;
}

/** ערכי טופס יצירה/עריכה של משימה. */
export interface TaskFormValues {
  title: string;
  description: string;
  student_id: string | null;
  treatment_id: string | null;
  assigned_to: string | null;
  due_date: string | null;
  priority: number;
  status: TaskStatus;
}

/** סדר עמודות הלוח (kanban). */
export const TASK_STATUS_ORDER: TaskStatus[] = [
  "open",
  "in_progress",
  "completed",
  "cancelled",
];

/** האם משימה באיחור: יש תאריך יעד שחלף והמשימה אינה סגורה. */
export function isTaskOverdue(
  task: Pick<TaskRow, "due_date" | "status">,
  today: string,
): boolean {
  if (!task.due_date) return false;
  if (task.status === "completed" || task.status === "cancelled") return false;
  return task.due_date < today;
}

/** מחרוזת התאריך של היום (זמן מקומי, YYYY-MM-DD). */
export function todayStr(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
