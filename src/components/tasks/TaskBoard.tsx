import { useState } from "react";

import { cn } from "@/lib/utils";
import { taskStatusLabels, type TaskStatus } from "@/lib/hebrew";
import { TaskCard } from "./TaskCard";
import { TASK_STATUS_ORDER, type TaskRow } from "./types";

const columnAccent: Record<TaskStatus, string> = {
  open: "bg-status-excused",
  in_progress: "bg-primary",
  completed: "bg-status-on-time",
  cancelled: "bg-status-unknown",
};

export interface TaskBoardProps {
  tasks: TaskRow[];
  today: string;
  staffName: (id: string | null) => string | null;
  onEdit: (task: TaskRow) => void;
  onComplete: (task: TaskRow) => void;
  onDelete: (task: TaskRow) => void;
  onStatusChange: (task: TaskRow, status: TaskStatus) => void;
}

/** לוח משימות (kanban) לפי סטטוס, עם גרירה בין עמודות. */
export function TaskBoard({
  tasks,
  today,
  staffName,
  onEdit,
  onComplete,
  onDelete,
  onStatusChange,
}: TaskBoardProps) {
  const [dragged, setDragged] = useState<TaskRow | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);

  const byStatus = (status: TaskStatus) =>
    tasks.filter((t) => t.status === status);

  function handleDrop(status: TaskStatus) {
    if (dragged && dragged.status !== status) {
      onStatusChange(dragged, status);
    }
    setDragged(null);
    setOverCol(null);
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {TASK_STATUS_ORDER.map((status) => {
        const items = byStatus(status);
        return (
          <div
            key={status}
            onDragOver={(e) => {
              if (dragged) {
                e.preventDefault();
                setOverCol(status);
              }
            }}
            onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
            onDrop={() => handleDrop(status)}
            className={cn(
              "flex flex-col rounded-2xl border border-border/70 bg-muted/30 p-3 transition-colors",
              overCol === status && dragged?.status !== status && "bg-accent/50 ring-2 ring-primary/40",
            )}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", columnAccent[status])} />
                <h3 className="text-sm font-semibold text-foreground">
                  {taskStatusLabels[status]}
                </h3>
              </div>
              <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {items.length}
              </span>
            </div>

            <div className="flex min-h-[80px] flex-col gap-2">
              {items.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  today={today}
                  staffName={staffName}
                  onEdit={onEdit}
                  onComplete={onComplete}
                  onDelete={onDelete}
                  draggable
                  onDragStart={setDragged}
                  onDragEnd={() => {
                    setDragged(null);
                    setOverCol(null);
                  }}
                />
              ))}
              {items.length === 0 && (
                <div className="rounded-xl border border-dashed border-border/60 py-6 text-center text-xs text-muted-foreground">
                  אין משימות
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
