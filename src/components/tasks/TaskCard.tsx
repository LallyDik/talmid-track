import { CalendarClock, CheckCircle2, GripVertical, Pencil, Trash2, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/kit";
import { cn } from "@/lib/utils";
import {
  formatHebrewDate,
  priorityLabels,
  type Priority,
} from "@/lib/hebrew";
import { isTaskOverdue, type TaskRow } from "./types";

const priorityTone: Record<Priority, string> = {
  1: "badge-red",
  2: "badge-blue",
  3: "badge-grey",
};

export interface TaskCardProps {
  task: TaskRow;
  today: string;
  staffName: (id: string | null) => string | null;
  onEdit: (task: TaskRow) => void;
  onComplete: (task: TaskRow) => void;
  onDelete: (task: TaskRow) => void;
  /** גרירה בין עמודות הלוח (nice-to-have). */
  draggable?: boolean;
  onDragStart?: (task: TaskRow) => void;
  onDragEnd?: () => void;
}

export function TaskCard({
  task,
  today,
  staffName,
  onEdit,
  onComplete,
  onDelete,
  draggable = false,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  const overdue = isTaskOverdue(task, today);
  const priority = task.priority as Priority;
  const assignee = staffName(task.assigned_to);
  const studentName = task.students?.full_name;
  const isClosed = task.status === "completed" || task.status === "cancelled";

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? () => onDragStart?.(task) : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      className={cn(
        "group rounded-xl border bg-card p-3 shadow-soft transition-shadow hover:shadow-card",
        overdue ? "border-status-absent/60" : "border-border/70",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className="flex items-start gap-2">
        {draggable && (
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                "text-sm font-semibold leading-snug",
                isClosed && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </p>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                priorityTone[priority] ?? "badge-grey",
              )}
            >
              {priorityLabels[priority] ?? "—"}
            </span>
          </div>

          {task.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {task.description}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {studentName && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" />
                {studentName}
              </span>
            )}
            {assignee && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" />
                {assignee}
              </span>
            )}
            {task.due_date && (
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  overdue && "font-semibold text-status-absent",
                )}
              >
                <CalendarClock className="h-3 w-3" />
                {formatHebrewDate(task.due_date, {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            )}
            {overdue && (
              <span className="rounded-full badge-red px-2 py-0.5 text-[10px] font-bold">
                באיחור
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-1">
            {!isClosed && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-status-on-time hover:text-status-on-time"
                onClick={() => onComplete(task)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                השלם
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onEdit(task)}
            >
              <Pencil className="h-3.5 w-3.5" />
              עריכה
            </Button>
            <ConfirmDialog
              title="מחיקת משימה"
              description={`למחוק לצמיתות את המשימה "${task.title}"? לא ניתן לשחזר פעולה זו.`}
              confirmText="מחק"
              destructive
              onConfirm={() => onDelete(task)}
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  מחק
                </Button>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
