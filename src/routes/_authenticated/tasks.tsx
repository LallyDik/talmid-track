import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Kanban,
  ListTodo,
  Plus,
  TriangleAlert,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard, EmptyState, PageSkeleton } from "@/components/kit";
import { type TaskStatus } from "@/lib/hebrew";
import {
  TaskBoard,
  TaskDialog,
  TaskFilters,
  TaskListView,
  DEFAULT_TASK_FILTERS,
  isDefaultFilters,
  isTaskOverdue,
  todayStr,
  type TaskFilterState,
  type TaskFormValues,
  type TaskRow,
} from "@/components/tasks";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
});

type View = "list" | "board";

function TasksPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: profileData } = useProfile(user?.id);
  const yeshivaId = profileData?.profile?.yeshiva_id;

  const today = todayStr();
  const [view, setView] = useState<View>("board");
  const [filters, setFilters] = useState<TaskFilterState>(DEFAULT_TASK_FILTERS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<
    (Partial<TaskFormValues> & { id?: string }) | null
  >(null);

  /* ----------------------------- queries ----------------------------- */
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, students(full_name), student_treatments(title)")
        .eq("yeshiva_id", yeshivaId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TaskRow[];
    },
  });

  const { data: staff } = useQuery({
    queryKey: ["yeshiva-staff", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("yeshiva_id", yeshivaId!);
      return (data ?? []).map((p) => ({
        id: p.id,
        full_name: p.full_name || p.email || "משתמש",
      }));
    },
  });

  const { data: students } = useQuery({
    queryKey: ["students-options", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, full_name")
        .eq("yeshiva_id", yeshivaId!)
        .order("full_name");
      return data ?? [];
    },
  });

  const { data: treatments } = useQuery({
    queryKey: ["treatments-options", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => {
      const { data } = await supabase
        .from("student_treatments")
        .select("id, title, student_id")
        .eq("yeshiva_id", yeshivaId!)
        .order("opened_at", { ascending: false });
      return data ?? [];
    },
  });

  const staffMap = useMemo(
    () => new Map((staff ?? []).map((s) => [s.id, s.full_name])),
    [staff],
  );
  const staffName = (id: string | null) => (id ? staffMap.get(id) ?? null : null);

  /* --------------------------- mutations ----------------------------- */
  const saveTask = useMutation({
    mutationFn: async (values: TaskFormValues) => {
      const completed_at =
        values.status === "completed"
          ? editing?.status === "completed"
            ? undefined // אין צורך לגעת אם כבר הושלמה
            : new Date().toISOString()
          : null;

      if (editing?.id) {
        const { error } = await supabase
          .from("tasks")
          .update({
            title: values.title,
            description: values.description || null,
            student_id: values.student_id,
            treatment_id: values.treatment_id,
            assigned_to: values.assigned_to,
            due_date: values.due_date,
            priority: values.priority,
            status: values.status,
            ...(completed_at !== undefined ? { completed_at } : {}),
          })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tasks").insert({
          yeshiva_id: yeshivaId!,
          title: values.title,
          description: values.description || null,
          student_id: values.student_id,
          treatment_id: values.treatment_id,
          assigned_to: values.assigned_to,
          due_date: values.due_date,
          priority: values.priority,
          status: values.status,
          completed_at: completed_at ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing?.id ? "המשימה עודכנה" : "המשימה נוצרה");
      setDialogOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["tasks", yeshivaId] });
    },
    onError: (e) => {
      toast.error("שמירת המשימה נכשלה", {
        description: e instanceof Error ? e.message : undefined,
      });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({
      task,
      status,
    }: {
      task: TaskRow;
      status: TaskStatus;
    }) => {
      const { error } = await supabase
        .from("tasks")
        .update({
          status,
          completed_at:
            status === "completed" ? new Date().toISOString() : null,
        })
        .eq("id", task.id);
      if (error) throw error;
    },
    onMutate: async ({ task, status }) => {
      await qc.cancelQueries({ queryKey: ["tasks", yeshivaId] });
      const prev = qc.getQueryData<TaskRow[]>(["tasks", yeshivaId]);
      qc.setQueryData<TaskRow[]>(["tasks", yeshivaId], (old) =>
        (old ?? []).map((t) =>
          t.id === task.id ? { ...t, status } : t,
        ),
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tasks", yeshivaId], ctx.prev);
      toast.error("עדכון הסטטוס נכשל", {
        description: e instanceof Error ? e.message : undefined,
      });
    },
    onSuccess: (_d, { status }) => {
      if (status === "completed") toast.success("המשימה סומנה כהושלמה");
      else toast.success("סטטוס המשימה עודכן");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks", yeshivaId] }),
  });

  const deleteTask = useMutation({
    mutationFn: async (task: TaskRow) => {
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("המשימה נמחקה");
      qc.invalidateQueries({ queryKey: ["tasks", yeshivaId] });
    },
    onError: (e) => {
      toast.error("מחיקת המשימה נכשלה", {
        description: e instanceof Error ? e.message : undefined,
      });
    },
  });

  /* ---------------------------- handlers ----------------------------- */
  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(task: TaskRow) {
    setEditing({
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      student_id: task.student_id,
      treatment_id: task.treatment_id,
      assigned_to: task.assigned_to,
      due_date: task.due_date,
      priority: task.priority,
      status: task.status,
    });
    setDialogOpen(true);
  }
  function completeTask(task: TaskRow) {
    updateStatus.mutate({ task, status: "completed" });
  }

  /* --------------------------- filtering ----------------------------- */
  const filtered = useMemo(() => {
    let rows = tasks ?? [];
    if (filters.assigned_to === "unassigned")
      rows = rows.filter((t) => !t.assigned_to);
    else if (filters.assigned_to !== "all")
      rows = rows.filter((t) => t.assigned_to === filters.assigned_to);
    if (filters.student_id !== "all")
      rows = rows.filter((t) => t.student_id === filters.student_id);
    if (filters.priority !== "all")
      rows = rows.filter((t) => String(t.priority) === filters.priority);
    if (filters.status !== "all")
      rows = rows.filter((t) => t.status === filters.status);
    if (filters.dueFrom)
      rows = rows.filter((t) => t.due_date && t.due_date >= filters.dueFrom);
    if (filters.dueTo)
      rows = rows.filter((t) => t.due_date && t.due_date <= filters.dueTo);
    if (filters.overdueOnly)
      rows = rows.filter((t) => isTaskOverdue(t, today));
    return rows;
  }, [tasks, filters, today]);

  /* ------------------------------ stats ------------------------------ */
  const stats = useMemo(() => {
    const all = tasks ?? [];
    return {
      total: all.length,
      openCount: all.filter(
        (t) => t.status === "open" || t.status === "in_progress",
      ).length,
      overdue: all.filter((t) => isTaskOverdue(t, today)).length,
      completed: all.filter((t) => t.status === "completed").length,
    };
  }, [tasks, today]);

  if (!yeshivaId || (isLoading && !tasks)) {
    return <PageSkeleton stats={4} rows={6} columns={6} />;
  }

  const hasAnyTasks = (tasks ?? []).length > 0;

  return (
    <div>
      <PageHeader
        title="משימות"
        subtitle="לוח משימות לכל צוות הישיבה"
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            משימה חדשה
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="סה״כ משימות" value={stats.total} icon={ListTodo} tone="teal" />
        <StatCard label="פתוחות" value={stats.openCount} icon={Kanban} tone="blue" />
        <StatCard
          label="באיחור"
          value={stats.overdue}
          icon={TriangleAlert}
          tone="red"
        />
        <StatCard
          label="הושלמו"
          value={stats.completed}
          icon={CheckCircle2}
          tone="green"
        />
      </div>

      <TaskFilters
        value={filters}
        onChange={setFilters}
        staff={staff ?? []}
        students={students ?? []}
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {filtered.length} מתוך {tasks?.length ?? 0} משימות
        </p>
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList>
            <TabsTrigger value="board">
              <Kanban className="ms-1 h-4 w-4" />
              לוח
            </TabsTrigger>
            <TabsTrigger value="list">
              <ListTodo className="ms-1 h-4 w-4" />
              רשימה
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {!hasAnyTasks ? (
        <EmptyState
          icon={ListTodo}
          title="אין עדיין משימות"
          description="צרו משימה ראשונה כדי לעקוב אחר מטלות הצוות."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              משימה חדשה
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="אין משימות התואמות לסינון"
          description="נסו לשנות או לאפס את מסנני החיפוש."
          action={
            !isDefaultFilters(filters) ? (
              <Button
                variant="outline"
                onClick={() => setFilters(DEFAULT_TASK_FILTERS)}
              >
                איפוס סינון
              </Button>
            ) : undefined
          }
        />
      ) : view === "board" ? (
        <TaskBoard
          tasks={filtered}
          today={today}
          staffName={staffName}
          onEdit={openEdit}
          onComplete={completeTask}
          onDelete={(t) => deleteTask.mutate(t)}
          onStatusChange={(task, status) => updateStatus.mutate({ task, status })}
        />
      ) : (
        <TaskListView
          tasks={filtered}
          today={today}
          staffName={staffName}
          onEdit={openEdit}
          onComplete={completeTask}
          onDelete={(t) => deleteTask.mutate(t)}
        />
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setEditing(null);
        }}
        initial={editing}
        students={students ?? []}
        staff={staff ?? []}
        treatments={treatments ?? []}
        onSubmit={(values) => saveTask.mutateAsync(values)}
        pending={saveTask.isPending}
      />
    </div>
  );
}
