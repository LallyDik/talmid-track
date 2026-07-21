import { CheckCircle2, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, StatusBadge, ConfirmDialog, type Column } from "@/components/kit";
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

export interface TaskListViewProps {
  tasks: TaskRow[];
  today: string;
  staffName: (id: string | null) => string | null;
  onEdit: (task: TaskRow) => void;
  onComplete: (task: TaskRow) => void;
  onDelete: (task: TaskRow) => void;
  loading?: boolean;
}

export function TaskListView({
  tasks,
  today,
  staffName,
  onEdit,
  onComplete,
  onDelete,
  loading,
}: TaskListViewProps) {
  const columns: Column<TaskRow>[] = [
    {
      key: "title",
      header: "משימה",
      cell: (t) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "font-medium",
                (t.status === "completed" || t.status === "cancelled") &&
                  "text-muted-foreground line-through",
              )}
            >
              {t.title}
            </span>
            {isTaskOverdue(t, today) && (
              <span className="rounded-full badge-red px-2 py-0.5 text-[10px] font-bold">
                באיחור
              </span>
            )}
          </div>
          {t.description && (
            <p className="mt-0.5 line-clamp-1 max-w-xs text-xs text-muted-foreground">
              {t.description}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "student",
      header: "בחור",
      cell: (t) => t.students?.full_name ?? "—",
    },
    {
      key: "assignee",
      header: "אחראי",
      cell: (t) => staffName(t.assigned_to) ?? "—",
    },
    {
      key: "priority",
      header: "עדיפות",
      cell: (t) => (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
            priorityTone[t.priority as Priority] ?? "badge-grey",
          )}
        >
          {priorityLabels[t.priority as Priority] ?? "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "סטטוס",
      cell: (t) => <StatusBadge kind="task" status={t.status} />,
    },
    {
      key: "due_date",
      header: "תאריך יעד",
      cell: (t) =>
        t.due_date ? (
          <span
            className={cn(
              isTaskOverdue(t, today) && "font-semibold text-status-absent",
            )}
          >
            {formatHebrewDate(t.due_date, { day: "numeric", month: "short", year: "numeric" })}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "actions",
      header: "פעולות",
      align: "end",
      cell: (t) => {
        const isClosed = t.status === "completed" || t.status === "cancelled";
        return (
          <div className="flex items-center justify-end gap-1">
            {!isClosed && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-status-on-time hover:text-status-on-time"
                title="השלם משימה"
                onClick={() => onComplete(t)}
              >
                <CheckCircle2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="עריכה"
              onClick={() => onEdit(t)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <ConfirmDialog
              title="מחיקת משימה"
              description={`למחוק לצמיתות את המשימה "${t.title}"? לא ניתן לשחזר פעולה זו.`}
              confirmText="מחק"
              destructive
              onConfirm={() => onDelete(t)}
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  title="מחיקה"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              }
            />
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={tasks}
      rowKey={(t) => t.id}
      pageSize={15}
      loading={loading}
    />
  );
}
