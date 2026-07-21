import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { studentStatusLabels } from "@/lib/hebrew";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { SectionCard } from "@/components/kit";
import { NONE, useClasses, type Student } from "./shared";

const schema = z.object({
  full_name: z.string().trim().min(1, "שם מלא הוא שדה חובה"),
  father_name: z.string().trim().optional(),
  class_id: z.string(),
  phone: z.string().trim().optional(),
  parent_phone: z.string().trim().optional(),
  email: z
    .string()
    .trim()
    .email("כתובת אימייל לא תקינה")
    .optional()
    .or(z.literal("")),
  address: z.string().trim().optional(),
  date_of_birth: z.string().optional(),
  status: z.enum(["active", "inactive", "vacation", "left", "suspended"]),
  active: z.boolean(),
  notes: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

function toFormValues(s: Student): FormValues {
  return {
    full_name: s.full_name ?? "",
    father_name: s.father_name ?? "",
    class_id: s.class_id ?? NONE,
    phone: s.phone ?? "",
    parent_phone: s.parent_phone ?? "",
    email: s.email ?? "",
    address: s.address ?? "",
    date_of_birth: s.date_of_birth ?? "",
    status: s.status,
    active: s.active,
    notes: s.notes ?? "",
  };
}

export function DetailsTab({ student }: { student: Student }) {
  const qc = useQueryClient();
  const { data: classes } = useClasses(student.yeshiva_id);
  const draftKey = `student-form-draft:${student.id}`;
  const [restored, setRestored] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(student),
  });

  // Restore an autosaved draft from localStorage on mount (once).
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<FormValues>;
        form.reset({ ...toFormValues(student), ...draft });
        setRestored(true);
      }
    } catch {
      /* ignore corrupt draft */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave: persist form values to localStorage as the user types (debounced).
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const sub = form.watch((values) => {
      const t = setTimeout(() => {
        try {
          localStorage.setItem(draftKey, JSON.stringify(values));
        } catch {
          /* storage may be full / unavailable */
        }
      }, 400);
      timers.push(t);
    });
    return () => {
      sub.unsubscribe();
      timers.forEach(clearTimeout);
    };
  }, [form, draftKey]);

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const patch = {
        full_name: values.full_name.trim(),
        father_name: values.father_name?.trim() || null,
        class_id: values.class_id === NONE ? null : values.class_id,
        phone: values.phone?.trim() || null,
        parent_phone: values.parent_phone?.trim() || null,
        email: values.email?.trim() || null,
        address: values.address?.trim() || null,
        date_of_birth: values.date_of_birth || null,
        status: values.status,
        active: values.active,
        notes: values.notes?.trim() || null,
      };
      const { error } = await supabase
        .from("students")
        .update(patch)
        .eq("id", student.id);
      if (error) throw error;
      return patch;
    },
    onMutate: async (values) => {
      await qc.cancelQueries({ queryKey: ["student", student.id] });
      const previous = qc.getQueryData(["student", student.id]);
      qc.setQueryData(["student", student.id], (old: unknown) =>
        old && typeof old === "object"
          ? {
              ...old,
              full_name: values.full_name.trim(),
              father_name: values.father_name?.trim() || null,
              class_id: values.class_id === NONE ? null : values.class_id,
              phone: values.phone?.trim() || null,
              parent_phone: values.parent_phone?.trim() || null,
              email: values.email?.trim() || null,
              address: values.address?.trim() || null,
              date_of_birth: values.date_of_birth || null,
              status: values.status,
              active: values.active,
              notes: values.notes?.trim() || null,
            }
          : old,
      );
      return { previous };
    },
    onError: (_err, _values, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(["student", student.id], ctx.previous);
      }
      toast.error("שמירת פרטי הבחור נכשלה. נסה שוב.");
    },
    onSuccess: () => {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      setRestored(false);
      form.reset(form.getValues());
      toast.success("פרטי הבחור נשמרו בהצלחה");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["student", student.id] });
    },
  });

  function discardDraft() {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    form.reset(toFormValues(student));
    setRestored(false);
    toast.success("הטיוטה נמחקה והשדות שוחזרו");
  }

  const dirty = form.formState.isDirty;

  return (
    <SectionCard
      title="פרטי הבחור"
      description="עריכת כל פרטי הבחור. שינויים נשמרים אוטומטית כטיוטה עד ללחיצה על שמירה."
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((v) => save.mutate(v))}
          className="space-y-5"
        >
          {restored && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm">
              <span>שוחזרה טיוטה שלא נשמרה מהעריכה הקודמת.</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={discardDraft}
              >
                <RotateCcw className="h-4 w-4" />
                בטל טיוטה
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>שם מלא</FormLabel>
                  <FormControl>
                    <Input placeholder="שם הבחור" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="father_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>שם האב</FormLabel>
                  <FormControl>
                    <Input placeholder="שם האב" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="class_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>שיעור</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="בחר שיעור" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>ללא שיעור</SelectItem>
                      {classes?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
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
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>סטטוס</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(studentStatusLabels).map(([k, label]) => (
                        <SelectItem key={k} value={k}>
                          {label}
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
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>טלפון</FormLabel>
                  <FormControl>
                    <Input dir="ltr" placeholder="050-0000000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="parent_phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>טלפון הורים</FormLabel>
                  <FormControl>
                    <Input dir="ltr" placeholder="050-0000000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>אימייל</FormLabel>
                  <FormControl>
                    <Input dir="ltr" placeholder="name@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="date_of_birth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>תאריך לידה</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>כתובת</FormLabel>
                  <FormControl>
                    <Input placeholder="כתובת מגורים" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>הערות</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="הערות פנימיות" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border p-4 md:col-span-2">
                  <div className="space-y-0.5">
                    <FormLabel>פעיל במערכת</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      בחורים שאינם פעילים לא ייכללו בדוחות ובהעלאות נוכחות חדשות.
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={save.isPending || !dirty}>
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              שמור שינויים
            </Button>
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => form.reset(toFormValues(student))}
              >
                בטל שינויים
              </Button>
            )}
          </div>
        </form>
      </Form>
    </SectionCard>
  );
}
