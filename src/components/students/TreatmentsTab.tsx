import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  HeartHandshake,
  Loader2,
  Plus,
  Send,
  User,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  DEFAULT_TREATMENT_TYPES,
  formatHebrewDate,
  formatHebrewDateTime,
  treatmentStatusLabels,
  type TreatmentStatus,
} from "@/lib/hebrew";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HebrewDatePicker } from "@/components/HebrewDatePicker";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, StatusBadge } from "@/components/kit";
import {
  NONE,
  isOverdue,
  staffName,
  todayISO,
  useStaff,
  type StaffMember,
} from "./shared";

type Treatment = Tables<"student_treatments">;
type TreatmentUpdate = Tables<"treatment_updates">;

const isClosed = (s: TreatmentStatus) => s === "completed" || s === "cancelled";

const createSchema = z.object({
  title: z.string().trim().min(1, "כותרת היא שדה חובה"),
  treatment_type: z.string(),
  assigned_to: z.string(),
  due_date: z.string().optional(),
  description: z.string().trim().optional(),
});
type CreateValues = z.infer<typeof createSchema>;

export function TreatmentsTab({
  studentId,
  yeshivaId,
  userId,
}: {
  studentId: string;
  yeshivaId?: string;
  userId?: string;
}) {
  const qc = useQueryClient();
  const { data: staff } = useStaff(yeshivaId);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Treatment | null>(null);

  const { data: treatments, isLoading } = useQuery({
    queryKey: ["student-treatments", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_treatments")
        .select("*")
        .eq("student_id", studentId)
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Treatment[];
    },
  });

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      title: "",
      treatment_type: DEFAULT_TREATMENT_TYPES[0],
      assigned_to: NONE,
      due_date: "",
      description: "",
    },
  });

  const createTreatment = useMutation({
    mutationFn: async (values: CreateValues) => {
      if (!yeshivaId) throw new Error("missing yeshiva");
      const { error } = await supabase.from("student_treatments").insert({
        yeshiva_id: yeshivaId,
        student_id: studentId,
        title: values.title.trim(),
        description: values.description?.trim() || null,
        treatment_type: values.treatment_type,
        assigned_to: values.assigned_to === NONE ? null : values.assigned_to,
        due_date: values.due_date || null,
        created_by: userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הטיפול נפתח בהצלחה");
      form.reset({
        title: "",
        treatment_type: DEFAULT_TREATMENT_TYPES[0],
        assigned_to: NONE,
        due_date: "",
        description: "",
      });
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["student-treatments", studentId] });
    },
    onError: () => toast.error("פתיחת הטיפול נכשלה. נסה שוב."),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              פתח טיפול
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="rounded-2xl">
            <DialogHeader className="text-right">
              <DialogTitle>פתיחת טיפול חדש</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((v) => createTreatment.mutate(v))}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>כותרת</FormLabel>
                      <FormControl>
                        <Input placeholder="נושא הטיפול" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="treatment_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>סוג טיפול</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {DEFAULT_TREATMENT_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="due_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>תאריך יעד</FormLabel>
                        <FormControl>
                          <HebrewDatePicker value={field.value ?? ""} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="assigned_to"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>אחראי</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="בחר אחראי" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NONE}>ללא אחראי</SelectItem>
                          {staff?.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.full_name || m.email || "משתמש"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>תיאור</FormLabel>
                      <FormControl>
                        <Textarea rows={3} placeholder="תיאור הטיפול (אופציונלי)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-start gap-2 pt-2">
                  <Button type="submit" disabled={createTreatment.isPending}>
                    {createTreatment.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    פתח טיפול
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setCreateOpen(false)}
                  >
                    ביטול
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-border bg-muted/30"
            />
          ))}
        </div>
      ) : treatments && treatments.length > 0 ? (
        <div className="space-y-3">
          {treatments.map((t) => {
            const overdue = isOverdue(t.due_date, isClosed(t.status));
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t)}
                className="w-full rounded-2xl border border-border bg-card p-4 text-start transition-colors hover:bg-accent/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{t.title}</div>
                  <div className="flex items-center gap-2">
                    {overdue && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        באיחור
                      </span>
                    )}
                    <StatusBadge kind="treatment" status={t.status} />
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {t.treatment_type && <span>{t.treatment_type}</span>}
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {staffName(staff, t.assigned_to)}
                  </span>
                  {t.due_date && (
                    <span
                      className={
                        overdue ? "inline-flex items-center gap-1 text-destructive" : "inline-flex items-center gap-1"
                      }
                    >
                      <CalendarClock className="h-3 w-3" />
                      יעד: {formatHebrewDate(t.due_date)}
                    </span>
                  )}
                </div>
                {t.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-foreground/90">
                    {t.description}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={HeartHandshake}
          title="אין טיפולים"
          description="נהל תוכניות טיפול, מעקבים ושיחות חיזוק לבחור זה."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              פתח טיפול ראשון
            </Button>
          }
        />
      )}

      {selected && (
        <TreatmentDetail
          key={selected.id}
          treatment={selected}
          studentId={studentId}
          userId={userId}
          staff={staff}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * Treatment detail dialog — status, updates thread, close-with-outcome
 * ---------------------------------------------------------------- */
function TreatmentDetail({
  treatment,
  studentId,
  userId,
  staff,
  onClose,
}: {
  treatment: Treatment;
  studentId: string;
  userId?: string;
  staff: StaffMember[] | undefined;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [newUpdate, setNewUpdate] = useState("");
  const [outcome, setOutcome] = useState(treatment.outcome ?? "");
  const overdue = isOverdue(treatment.due_date, isClosed(treatment.status));

  const { data: updates, isLoading } = useQuery({
    queryKey: ["treatment-updates", treatment.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_updates")
        .select("*")
        .eq("treatment_id", treatment.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TreatmentUpdate[];
    },
  });

  function invalidateTreatments() {
    qc.invalidateQueries({ queryKey: ["student-treatments", studentId] });
  }

  const changeStatus = useMutation({
    mutationFn: async (status: TreatmentStatus) => {
      const patch: Partial<Treatment> = {
        status,
        completed_at: status === "completed" ? new Date().toISOString() : null,
      };
      const { error } = await supabase
        .from("student_treatments")
        .update(patch)
        .eq("id", treatment.id);
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      toast.success(`סטטוס הטיפול עודכן ל"${treatmentStatusLabels[status]}"`);
      invalidateTreatments();
    },
    onError: () => toast.error("עדכון הסטטוס נכשל. נסה שוב."),
  });

  const addUpdate = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.from("treatment_updates").insert({
        treatment_id: treatment.id,
        content: content.trim(),
        created_by: userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("העדכון נוסף");
      setNewUpdate("");
      qc.invalidateQueries({ queryKey: ["treatment-updates", treatment.id] });
    },
    onError: () => toast.error("הוספת העדכון נכשלה. נסה שוב."),
  });

  const closeTreatment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("student_treatments")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          outcome: outcome.trim() || null,
        })
        .eq("id", treatment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הטיפול נסגר בהצלחה");
      invalidateTreatments();
      onClose();
    },
    onError: () => toast.error("סגירת הטיפול נכשלה. נסה שוב."),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg"
      >
        <DialogHeader className="text-right">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {treatment.title}
            {overdue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                <AlertTriangle className="h-3 w-3" />
                באיחור
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Meta label="סוג" value={treatment.treatment_type ?? "—"} />
            <Meta label="אחראי" value={staffName(staff, treatment.assigned_to)} />
            <Meta
              label="תאריך יעד"
              value={treatment.due_date ? formatHebrewDate(treatment.due_date) : "—"}
              danger={overdue}
            />
            <Meta label="נפתח" value={formatHebrewDate(treatment.opened_at)} />
          </div>

          {treatment.description && (
            <p className="rounded-xl bg-muted/40 p-3 text-sm">{treatment.description}</p>
          )}

          {/* Status control */}
          <div className="space-y-1.5">
            <div className="text-sm font-medium">סטטוס</div>
            <Select
              value={treatment.status}
              onValueChange={(v) => changeStatus.mutate(v as TreatmentStatus)}
              disabled={changeStatus.isPending}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(treatmentStatusLabels).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Updates thread */}
          <div className="space-y-2">
            <div className="text-sm font-medium">עדכוני טיפול</div>
            {isLoading ? (
              <div className="h-16 animate-pulse rounded-xl bg-muted/30" />
            ) : updates && updates.length > 0 ? (
              <ul className="space-y-2">
                {updates.map((u) => (
                  <li
                    key={u.id}
                    className="rounded-xl border border-border bg-card p-3"
                  >
                    <p className="whitespace-pre-wrap text-sm">{u.content}</p>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{staffName(staff, u.created_by)}</span>
                      <span>·</span>
                      <span>{formatHebrewDateTime(u.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-3 text-center text-sm text-muted-foreground">
                אין עדכונים עדיין.
              </p>
            )}

            <div className="flex items-start gap-2">
              <Textarea
                rows={2}
                value={newUpdate}
                onChange={(e) => setNewUpdate(e.target.value)}
                placeholder="הוסף עדכון לטיפול..."
              />
              <Button
                size="icon"
                disabled={!newUpdate.trim() || addUpdate.isPending}
                onClick={() => addUpdate.mutate(newUpdate)}
                aria-label="שלח עדכון"
              >
                {addUpdate.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Close with outcome */}
          {!isClosed(treatment.status) && (
            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
              <div className="text-sm font-medium">סגירת הטיפול</div>
              <Textarea
                rows={2}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                placeholder="סיכום ותוצאת הטיפול..."
              />
              <Button
                variant="default"
                disabled={closeTreatment.isPending}
                onClick={() => closeTreatment.mutate()}
              >
                {closeTreatment.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                סגור טיפול
              </Button>
            </div>
          )}

          {isClosed(treatment.status) && treatment.outcome && (
            <div className="space-y-1 rounded-xl border border-border bg-muted/30 p-3">
              <div className="text-sm font-medium">תוצאת הטיפול</div>
              <p className="text-sm">{treatment.outcome}</p>
              {treatment.completed_at && (
                <p className="text-xs text-muted-foreground">
                  נסגר ב{formatHebrewDate(treatment.completed_at)}
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Meta({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={danger ? "font-medium text-destructive" : "font-medium"}>
        {value}
      </div>
    </div>
  );
}
