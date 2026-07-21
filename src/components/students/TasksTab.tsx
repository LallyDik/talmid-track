import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ClipboardList, Loader2, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  formatHebrewDate,
  priorityLabels,
  type Priority,
} from "@/lib/hebrew";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  StatusBadge,
  type Column,
} from "@/components/kit";
import { NONE, isOverdue, staffName, useStaff } from "./shared";

type Task = Tables<"tasks">;

const priorityTone: Record<Priority, string> = {
  1: "badge-red",
  2: "badge-amber",
  3: "badge-grey",
};

const schema = z.object({
  title: z.string().trim().min(1, "כותרת היא שדה חובה"),
  assigned_to: z.string(),
  due_date: z.string().optional(),
  priority: z.enum(["1", "2", "3"]),
  description: z.string().trim().optional(),
});
type FormValues = z.infer<typeof schema>;

export function TasksTab({
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
  const [open, setOpen] = useState(false);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["student-tasks", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      assigned_to: NONE,
      due_date: "",
      priority: "2",
      description: "",
    },
  });

  const createTask = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!yeshivaId) throw new Error("missing yeshiva");
      const { error } = await supabase.from("tasks").insert({
        yeshiva_id: yeshivaId,
        student_id: studentId,
        title: values.title.trim(),
        description: values.description?.trim() || null,
        assigned_to: values.assigned_to === NONE ? null : values.assigned_to,
        due_date: values.due_date || null,
        priority: Number(values.priority),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("המשימה נוצרה בהצלחה");
      form.reset({
        title: "",
        assigned_to: NONE,
        due_date: "",
        priority: "2",
        description: "",
      });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["student-tasks", studentId] });
    },
    onError: () => toast.error("יצירת המשימה נכשלה. נסה שוב."),
  });

  const completeTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("המשימה סומנה כהושלמה");
      qc.invalidateQueries({ queryKey: ["student-tasks", studentId] });
    },
    onError: () => toast.error("עדכון המשימה נכשל. נסה שוב."),
  });

  const columns: Column<Task>[] = [
    {
      key: "title",
      header: "משימה",
      cell: (t) => (
        <div className="min-w-0">
          <div className="font-medium">{t.title}</div>
          {t.description && (
            <div className="line-clamp-1 text-xs text-muted-foreground">
              {t.description}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "priority",
      header: "עדיפות",
      cell: (t) => {
        const p = (t.priority as Priority) ?? 2;
        return (
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${priorityTone[p] ?? "badge-grey"}`}
          >
            {priorityLabels[p] ?? "רגילה"}
          </span>
        );
      },
    },
    {
      key: "assigned",
      header: "אחראי",
      cell: (t) => staffName(staff, t.assigned_to),
    },
    {
      key: "due",
      header: "תאריך יעד",
      cell: (t) => {
        const overdue = isOverdue(
          t.due_date,
          t.status === "completed" || t.status === "cancelled",
        );
        if (!t.due_date) return "—";
        return (
          <span className={overdue ? "font-medium text-destructive" : undefined}>
            {formatHebrewDate(t.due_date)}
            {overdue && " · באיחור"}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "סטטוס",
      cell: (t) => <StatusBadge kind="task" status={t.status} />,
    },
    {
      key: "actions",
      header: "",
      align: "end",
      cell: (t) =>
        t.status === "completed" || t.status === "cancelled" ? null : (
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm">
                <CheckCircle2 className="h-4 w-4" />
                סיים
              </Button>
            }
            title="סימון משימה כהושלמה"
            description={`לסמן את "${t.title}" כהושלמה?`}
            confirmText="סמן כהושלמה"
            onConfirm={() => completeTask.mutateAsync(t.id)}
          />
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              משימה חדשה
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="rounded-2xl">
            <DialogHeader className="text-right">
              <DialogTitle>יצירת משימה</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((v) => createTask.mutate(v))}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>כותרת</FormLabel>
                      <FormControl>
                        <Input placeholder="כותרת המשימה" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>עדיפות</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(["1", "2", "3"] as const).map((p) => (
                              <SelectItem key={p} value={p}>
                                {priorityLabels[Number(p) as Priority]}
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
                          <Input type="date" {...field} />
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
                        <Textarea rows={3} placeholder="תיאור (אופציונלי)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-start gap-2 pt-2">
                  <Button type="submit" disabled={createTask.isPending}>
                    {createTask.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    צור משימה
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

      <DataTable
        columns={columns}
        data={tasks ?? []}
        rowKey={(t) => t.id}
        loading={isLoading}
        pageSize={10}
        empty={
          <EmptyState
            icon={ClipboardList}
            title="אין משימות"
            description="צור משימות מעקב ומטלות עבור הבחור."
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                משימה חדשה
              </Button>
            }
          />
        }
      />
    </div>
  );
}
