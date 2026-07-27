import { RotateCcw } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HebrewDatePicker } from "@/components/HebrewDatePicker";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { priorityLabels, taskStatusLabels, type TaskStatus } from "@/lib/hebrew";
import type { StaffOption, StudentOption } from "./types";

export interface TaskFilterState {
  assigned_to: string; // "all" | "unassigned" | staffId
  student_id: string; // "all" | studentId
  priority: string; // "all" | "1" | "2" | "3"
  status: string; // "all" | TaskStatus
  dueFrom: string; // "" | YYYY-MM-DD
  dueTo: string; // "" | YYYY-MM-DD
  overdueOnly: boolean;
}

export const DEFAULT_TASK_FILTERS: TaskFilterState = {
  assigned_to: "all",
  student_id: "all",
  priority: "all",
  status: "all",
  dueFrom: "",
  dueTo: "",
  overdueOnly: false,
};

export function isDefaultFilters(f: TaskFilterState): boolean {
  return (
    f.assigned_to === "all" &&
    f.student_id === "all" &&
    f.priority === "all" &&
    f.status === "all" &&
    f.dueFrom === "" &&
    f.dueTo === "" &&
    !f.overdueOnly
  );
}

export interface TaskFiltersProps {
  value: TaskFilterState;
  onChange: (next: TaskFilterState) => void;
  staff: StaffOption[];
  students: StudentOption[];
}

export function TaskFilters({
  value,
  onChange,
  staff,
  students,
}: TaskFiltersProps) {
  const patch = (p: Partial<TaskFilterState>) => onChange({ ...value, ...p });

  return (
    <div className="mb-5 rounded-2xl border border-border/70 bg-card p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Field label="אחראי">
          <Select
            value={value.assigned_to}
            onValueChange={(v) => patch({ assigned_to: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="all">כל הצוות</SelectItem>
              <SelectItem value="unassigned">לא משויך</SelectItem>
              {staff.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="בחור">
          <Select
            value={value.student_id}
            onValueChange={(v) => patch({ student_id: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="all">כל הבחורים</SelectItem>
              {students.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="עדיפות">
          <Select
            value={value.priority}
            onValueChange={(v) => patch({ priority: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="all">כל העדיפויות</SelectItem>
              {([1, 2, 3] as const).map((p) => (
                <SelectItem key={p} value={String(p)}>
                  {priorityLabels[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="סטטוס">
          <Select
            value={value.status}
            onValueChange={(v) => patch({ status: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="all">כל הסטטוסים</SelectItem>
              {(Object.keys(taskStatusLabels) as TaskStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {taskStatusLabels[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="יעד מתאריך">
          <HebrewDatePicker
            value={value.dueFrom}
            max={value.dueTo || undefined}
            onChange={(iso) => patch({ dueFrom: iso })}
          />
        </Field>

        <Field label="יעד עד תאריך">
          <HebrewDatePicker
            value={value.dueTo}
            min={value.dueFrom || undefined}
            onChange={(iso) => patch({ dueTo: iso })}
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id="overdue-only"
            checked={value.overdueOnly}
            onCheckedChange={(v) => patch({ overdueOnly: v })}
          />
          <Label htmlFor="overdue-only" className="cursor-pointer text-sm">
            באיחור בלבד
          </Label>
        </div>
        {!isDefaultFilters(value) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(DEFAULT_TASK_FILTERS)}
          >
            <RotateCcw className="h-4 w-4" />
            איפוס סינון
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
