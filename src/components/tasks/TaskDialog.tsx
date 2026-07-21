import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { priorityLabels, taskStatusLabels, type TaskStatus } from "@/lib/hebrew";
import type {
  StaffOption,
  StudentOption,
  TaskFormValues,
  TreatmentOption,
} from "./types";

const NONE = "none";

const formSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "יש להזין כותרת למשימה")
    .max(200, "הכותרת ארוכה מדי (עד 200 תווים)"),
  description: z.string().trim().max(2000, "התיאור ארוך מדי").optional(),
  student_id: z.string().uuid().nullable(),
  treatment_id: z.string().uuid().nullable(),
  assigned_to: z.string().uuid().nullable(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין")
    .nullable(),
  priority: z.number().int().min(1).max(3),
  status: z.enum(["open", "in_progress", "completed", "cancelled"]),
});

const EMPTY: TaskFormValues = {
  title: "",
  description: "",
  student_id: null,
  treatment_id: null,
  assigned_to: null,
  due_date: null,
  priority: 2,
  status: "open",
};

export interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** כאשר קיים — הדיאלוג במצב עריכה. */
  initial?: (Partial<TaskFormValues> & { id?: string }) | null;
  students: StudentOption[];
  staff: StaffOption[];
  treatments: TreatmentOption[];
  onSubmit: (values: TaskFormValues) => Promise<void>;
  pending?: boolean;
}

export function TaskDialog({
  open,
  onOpenChange,
  initial,
  students,
  staff,
  treatments,
  onSubmit,
  pending = false,
}: TaskDialogProps) {
  const isEdit = !!initial?.id;
  const [values, setValues] = useState<TaskFormValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setValues({ ...EMPTY, ...(initial ?? {}) });
      setErrors({});
    }
  }, [open, initial]);

  const set = <K extends keyof TaskFormValues>(key: K, val: TaskFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: val }));

  // טיפולים מסוננים לפי הבחור שנבחר.
  const studentTreatments = useMemo(
    () =>
      values.student_id
        ? treatments.filter((t) => t.student_id === values.student_id)
        : [],
    [treatments, values.student_id],
  );

  async function handleSubmit() {
    const parsed = formSchema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (typeof path === "string" && !next[path]) next[path] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      // בהצלחה — הקורא (המסך) סוגר את הדיאלוג דרך onOpenChange.
      // בכישלון — משאירים את הדיאלוג פתוח; הקורא מציג toast שגיאה.
      await onSubmit({
        ...parsed.data,
        description: parsed.data.description ?? "",
      });
    } catch {
      /* נשאר פתוח */
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg" dir="rtl">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>{isEdit ? "עריכת משימה" : "משימה חדשה"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "עדכון פרטי המשימה הקיימת."
              : "יצירת משימה חדשה עבור צוות הישיבה."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="task-title">כותרת *</Label>
            <Input
              id="task-title"
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="לדוגמה: שיחה עם ההורים"
              aria-invalid={!!errors.title}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="task-desc">תיאור</Label>
            <Textarea
              id="task-desc"
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="פרטים נוספים (אופציונלי)"
              rows={3}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>בחור מקושר</Label>
              <Select
                value={values.student_id ?? NONE}
                onValueChange={(v) => {
                  set("student_id", v === NONE ? null : v);
                  set("treatment_id", null); // איפוס טיפול בעת שינוי בחור
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="ללא" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value={NONE}>ללא</SelectItem>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>טיפול מקושר</Label>
              <Select
                value={values.treatment_id ?? NONE}
                onValueChange={(v) => set("treatment_id", v === NONE ? null : v)}
                disabled={!values.student_id || studentTreatments.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      values.student_id ? "ללא" : "בחרו בחור תחילה"
                    }
                  />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value={NONE}>ללא</SelectItem>
                  {studentTreatments.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>אחראי (איש צוות)</Label>
              <Select
                value={values.assigned_to ?? NONE}
                onValueChange={(v) => set("assigned_to", v === NONE ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="לא משויך" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value={NONE}>לא משויך</SelectItem>
                  {staff.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="task-due">תאריך יעד</Label>
              <Input
                id="task-due"
                type="date"
                value={values.due_date ?? ""}
                onChange={(e) => set("due_date", e.target.value || null)}
                aria-invalid={!!errors.due_date}
              />
              {errors.due_date && (
                <p className="text-xs text-destructive">{errors.due_date}</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label>עדיפות</Label>
              <Select
                value={String(values.priority)}
                onValueChange={(v) => set("priority", Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {([1, 2, 3] as const).map((p) => (
                    <SelectItem key={p} value={String(p)}>
                      {priorityLabels[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>סטטוס</Label>
              <Select
                value={values.status}
                onValueChange={(v) => set("status", v as TaskStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {(
                    Object.keys(taskStatusLabels) as TaskStatus[]
                  ).map((s) => (
                    <SelectItem key={s} value={s}>
                      {taskStatusLabels[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row justify-start gap-2 sm:justify-start">
          <Button onClick={handleSubmit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "שמירת שינויים" : "יצירת משימה"}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
