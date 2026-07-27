import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { safeStorageKey } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Loader2, Paperclip, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  DEFAULT_EVENT_TYPES,
  formatHebrewDate,
  severityLabels,
  type Severity,
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
import { todayISO } from "./shared";

type StudentEvent = Tables<"student_events">;

const schema = z.object({
  title: z.string().trim().min(1, "כותרת היא שדה חובה"),
  event_type: z.string().min(1, "יש לבחור סוג אירוע"),
  event_date: z.string().min(1, "יש לבחור תאריך"),
  severity: z.enum(["info", "low", "medium", "high", "urgent"]),
  description: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

export function EventsTab({
  studentId,
  yeshivaId,
  userId,
}: {
  studentId: string;
  yeshivaId?: string;
  userId?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const { data: events, isLoading } = useQuery({
    queryKey: ["student-events", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_events")
        .select("*")
        .eq("student_id", studentId)
        .order("event_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StudentEvent[];
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      event_type: DEFAULT_EVENT_TYPES[0],
      event_date: todayISO(),
      severity: "info",
      description: "",
    },
  });

  const addEvent = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!yeshivaId) throw new Error("missing yeshiva");
      const { error } = await supabase.from("student_events").insert({
        yeshiva_id: yeshivaId,
        student_id: studentId,
        title: values.title.trim(),
        description: values.description?.trim() || null,
        event_type: values.event_type,
        event_date: values.event_date,
        severity: values.severity,
        created_by: userId ?? null,
      });
      if (error) throw error;

      // Optional file attachment -> student-documents bucket + table.
      if (file) {
        const path = safeStorageKey(`${yeshivaId}/${studentId}`, file.name);
        const { error: upErr } = await supabase.storage
          .from("student-documents")
          .upload(path, file);
        if (upErr) throw upErr;
        const { error: docErr } = await supabase.from("student_documents").insert({
          yeshiva_id: yeshivaId,
          student_id: studentId,
          file_path: path,
          original_file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          title: `צרופה לאירוע: ${values.title.trim()}`,
          uploaded_by: userId ?? null,
        });
        if (docErr) throw docErr;
      }
    },
    onSuccess: () => {
      toast.success("האירוע נוסף בהצלחה");
      form.reset({
        title: "",
        event_type: DEFAULT_EVENT_TYPES[0],
        event_date: todayISO(),
        severity: "info",
        description: "",
      });
      setFile(null);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["student-events", studentId] });
      qc.invalidateQueries({ queryKey: ["student-documents", studentId] });
    },
    onError: () => {
      toast.error("הוספת האירוע נכשלה. נסה שוב.");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              הוסף אירוע
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="rounded-2xl">
            <DialogHeader className="text-right">
              <DialogTitle>הוספת אירוע</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((v) => addEvent.mutate(v))}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>כותרת</FormLabel>
                      <FormControl>
                        <Input placeholder="כותרת האירוע" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="event_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>סוג אירוע</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {DEFAULT_EVENT_TYPES.map((t) => (
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
                    name="event_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>תאריך</FormLabel>
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
                  name="severity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>חומרה</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(severityLabels).map(([k, label]) => (
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
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>תיאור</FormLabel>
                      <FormControl>
                        <Textarea rows={3} placeholder="תיאור (אופציונלי)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="space-y-1.5">
                  <FormLabel>צרופה (אופציונלי)</FormLabel>
                  <Input
                    type="file"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  {file && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Paperclip className="h-3 w-3" />
                      {file.name}
                    </p>
                  )}
                </div>
                <div className="flex justify-start gap-2 pt-2">
                  <Button type="submit" disabled={addEvent.isPending}>
                    {addEvent.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    שמור אירוע
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setOpen(false)}
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
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl border border-border bg-muted/30"
            />
          ))}
        </div>
      ) : events && events.length > 0 ? (
        <ol className="relative space-y-4 border-r-2 border-border pr-5">
          {events.map((ev) => (
            <li key={ev.id} className="relative">
              <span
                className="absolute -right-[26px] top-1.5 h-3.5 w-3.5 rounded-full ring-4 ring-background"
                style={{
                  backgroundColor: `var(--status-${severityAnchor(ev.severity)})`,
                }}
                aria-hidden
              />
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{ev.title}</div>
                  <div className="flex items-center gap-2">
                    <StatusBadge kind="severity" status={ev.severity} />
                    <span className="text-xs text-muted-foreground">
                      {formatHebrewDate(ev.event_date)}
                    </span>
                  </div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {ev.event_type}
                </div>
                {ev.description && (
                  <p className="mt-2 text-sm text-foreground/90">{ev.description}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          icon={CalendarClock}
          title="אין אירועים"
          description="תיעוד אירועים, שיחות והישגים יופיע כאן."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              הוסף אירוע ראשון
            </Button>
          }
        />
      )}
    </div>
  );
}

/**
 * The severity CSS variables live under --status-* via the severity utilities;
 * map each severity to the underlying status color used by severityClass.
 */
function severityAnchor(severity: Severity): string {
  const map: Record<Severity, string> = {
    info: "excused",
    low: "on-time",
    medium: "late-b",
    high: "late-c",
    urgent: "absent",
  };
  return map[severity];
}
