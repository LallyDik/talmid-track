import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Download,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Search,
  SearchX,
  Upload,
  Users,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import {
  useStudentStats,
  EMPTY_STUDENT_STATS,
  type StudentStats,
} from "@/hooks/useStudentStats";
import { studentStatusLabels, formatHebrewDate, type StudentStatus } from "@/lib/hebrew";
import { cn } from "@/lib/utils";

import { DataTable, EmptyState, ConfirmDialog, StatusBadge, type Column } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const Route = createFileRoute("/_authenticated/students/")({
  component: StudentsPage,
});

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */
interface Student {
  id: string;
  full_name: string;
  father_name: string | null;
  class_id: string | null;
  phone: string | null;
  parent_phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  address: string | null;
  status: StudentStatus;
  notes: string | null;
  active: boolean;
  classes: { name: string } | null;
}

interface ClassRow {
  id: string;
  name: string;
}

interface Row {
  student: Student;
  stat: StudentStats;
}

type SortKey = "name" | "rate" | "late" | "absent" | "treatments";

const STUDENT_STATUSES = ["active", "inactive", "vacation", "left", "suspended"] as const;

const STUDENT_COLUMNS =
  "id, full_name, father_name, class_id, phone, parent_phone, email, date_of_birth, address, status, notes, active, classes(name)";

const MAX_ROWS = 1000;

// Import screen lives in a sibling route owned by another agent; kept as a
// widened string so this file type-checks before that route is generated.
const IMPORT_ROUTE: string = "/students/import";

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */
function StudentsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: profileData } = useProfile(user?.id);
  const yeshivaId = profileData?.profile?.yeshiva_id ?? undefined;

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "name",
    dir: "asc",
  });
  const [addOpen, setAddOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);

  // Debounce the name search so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const classesQuery = useQuery({
    queryKey: ["classes-list", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name")
        .eq("yeshiva_id", yeshivaId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });
  const classes = classesQuery.data ?? [];

  const studentsQuery = useQuery({
    queryKey: ["students", yeshivaId, search, classFilter, statusFilter],
    enabled: !!yeshivaId,
    queryFn: async () => {
      let q = supabase
        .from("students")
        .select(STUDENT_COLUMNS)
        .eq("yeshiva_id", yeshivaId!)
        .eq("active", true)
        .order("full_name", { ascending: true })
        .range(0, MAX_ROWS - 1);

      const term = search.replace(/[,()*%]/g, " ").trim();
      if (term) q = q.or(`full_name.ilike.%${term}%,father_name.ilike.%${term}%`);
      if (classFilter !== "all") q = q.eq("class_id", classFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter as StudentStatus);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Student[];
    },
  });

  const {
    stats,
    isLoading: statsLoading,
    isError: statsError,
  } = useStudentStats(yeshivaId);

  useEffect(() => {
    if (studentsQuery.isError) toast.error("שגיאה בטעינת רשימת הבחורים");
  }, [studentsQuery.isError]);
  useEffect(() => {
    if (classesQuery.isError) toast.error("שגיאה בטעינת רשימת השיעורים");
  }, [classesQuery.isError]);
  useEffect(() => {
    if (statsError) toast.error("שגיאה בטעינת נתוני הנוכחות");
  }, [statsError]);

  const rows: Row[] = useMemo(() => {
    const list = (studentsQuery.data ?? []).map((student) => ({
      student,
      stat: stats.get(student.id) ?? EMPTY_STUDENT_STATS,
    }));
    const dir = sort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sort.key) {
        case "rate":
          return (a.stat.rate - b.stat.rate) * dir;
        case "late":
          return (a.stat.late - b.stat.late) * dir;
        case "absent":
          return (a.stat.absent - b.stat.absent) * dir;
        case "treatments":
          return (a.stat.openTreatments - b.stat.openTreatments) * dir;
        case "name":
        default:
          return a.student.full_name.localeCompare(b.student.full_name, "he") * dir;
      }
    });
    return list;
  }, [studentsQuery.data, stats, sort]);

  const disableMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("students").update({ active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הבחור הושבת");
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: unknown) => {
      toast.error("השבתת הבחור נכשלה", { description: messageOf(e) });
    },
  });

  const toggleSort = (key: SortKey) =>
    setSort((p) =>
      p.key === key
        ? { key, dir: p.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );

  const sortHeader = (label: string, key: SortKey) => {
    const active = sort.key === key;
    const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground",
          active && "text-foreground",
        )}
      >
        <span>{label}</span>
        <Icon className={cn("h-3.5 w-3.5", !active && "opacity-40")} />
      </button>
    );
  };

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: sortHeader("שם", "name"),
      cell: ({ student }) => (
        <Link
          to="/students/$id"
          params={{ id: student.id }}
          className="font-medium text-foreground hover:text-primary hover:underline"
        >
          {student.full_name}
        </Link>
      ),
    },
    {
      key: "father",
      header: "שם האב",
      cell: ({ student }) => student.father_name ?? <Muted>—</Muted>,
    },
    {
      key: "class",
      header: "שיעור",
      cell: ({ student }) => student.classes?.name ?? <Muted>—</Muted>,
    },
    {
      key: "rate",
      header: sortHeader("אחוז נוכחות", "rate"),
      width: "180px",
      cell: ({ stat }) => <RateCell stat={stat} />,
    },
    {
      key: "late",
      header: sortHeader("איחורים", "late"),
      align: "center",
      cell: ({ stat }) =>
        stat.total === 0 ? <Muted>—</Muted> : <span className="tabular-nums">{stat.late}</span>,
    },
    {
      key: "absent",
      header: sortHeader("היעדרויות", "absent"),
      align: "center",
      cell: ({ stat }) =>
        stat.total === 0 ? (
          <Muted>—</Muted>
        ) : (
          <span className={cn("tabular-nums", stat.absent > 0 && "font-medium text-destructive")}>
            {stat.absent}
          </span>
        ),
    },
    {
      key: "treatments",
      header: sortHeader("טיפולים פתוחים", "treatments"),
      align: "center",
      cell: ({ stat }) =>
        stat.openTreatments > 0 ? (
          <span className="badge-amber inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold">
            {stat.openTreatments}
          </span>
        ) : (
          <Muted>—</Muted>
        ),
    },
    {
      key: "last_event",
      header: "אירוע אחרון",
      cell: ({ stat }) =>
        stat.lastEvent ? (
          <div className="min-w-0 max-w-[200px]">
            <div className="truncate text-sm text-foreground" title={stat.lastEvent.title}>
              {stat.lastEvent.title}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatHebrewDate(stat.lastEvent.date)}
            </div>
          </div>
        ) : (
          <Muted>—</Muted>
        ),
    },
    {
      key: "status",
      header: "סטטוס",
      cell: ({ student }) => <StatusBadge kind="student" status={student.status} />,
    },
    {
      key: "actions",
      header: "פעולות",
      align: "end",
      cell: ({ student }) => (
        <RowActions
          student={student}
          onEdit={setEditStudent}
          onDisable={(id) => disableMutation.mutateAsync(id)}
        />
      ),
    },
  ];

  const hasFilters = search !== "" || classFilter !== "all" || statusFilter !== "all";
  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setClassFilter("all");
    setStatusFilter("all");
  };

  const emptyNode = hasFilters ? (
    <EmptyState
      icon={SearchX}
      title="לא נמצאו בחורים"
      description="לא נמצאו בחורים התואמים לסינון הנוכחי."
      action={
        <Button variant="outline" onClick={clearFilters}>
          ניקוי סינון
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={Users}
      title="אין בחורים עדיין"
      description="הוסיפו בחור ראשון או ייבאו רשימה קיימת מקובץ."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => setAddOpen(true)} disabled={!yeshivaId}>
            <Plus className="h-4 w-4" />
            הוסף בחור
          </Button>
          <Button asChild variant="outline">
            <Link to={IMPORT_ROUTE}>
              <Upload className="h-4 w-4" />
              ייבוא מקובץ
            </Link>
          </Button>
        </div>
      }
    />
  );

  const exportExcel = () => {
    if (!rows.length) {
      toast.error("אין נתונים לייצוא");
      return;
    }
    try {
      const sheetRows = rows.map(({ student, stat }) => ({
        "שם": student.full_name,
        "שם האב": student.father_name ?? "",
        "שיעור": student.classes?.name ?? "",
        "טלפון": student.phone ?? "",
        "טלפון הורים": student.parent_phone ?? "",
        "אחוז נוכחות": stat.total > 0 ? `${stat.rate}%` : "",
        "מספר איחורים": stat.late,
        "מספר היעדרויות": stat.absent,
        "טיפולים פתוחים": stat.openTreatments,
        "אירוע אחרון": stat.lastEvent
          ? `${stat.lastEvent.title} (${formatHebrewDate(stat.lastEvent.date)})`
          : "",
        "סטטוס": studentStatusLabels[student.status],
      }));

      const ws = XLSX.utils.json_to_sheet(sheetRows);
      ws["!cols"] = [
        { wch: 20 },
        { wch: 16 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 14 },
        { wch: 28 },
        { wch: 12 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "בחורים");
      // Open the workbook right-to-left in Excel.
      wb.Workbook = { ...(wb.Workbook ?? {}), Views: [{ RTL: true }] };

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `בחורים-${today}.xlsx`);
      toast.success(`הקובץ יוצא בהצלחה (${rows.length} בחורים)`);
    } catch (e: unknown) {
      toast.error("ייצוא ל-Excel נכשל", { description: messageOf(e) });
    }
  };

  const loading = studentsQuery.isLoading || statsLoading;

  return (
    <TooltipProvider delayDuration={200}>
      <div>
        <PageHeader
          title="רשימת בחורים"
          subtitle={`${rows.length} בחורים${hasFilters ? " (מסונן)" : ""}`}
          actions={
            <>
              <Button variant="outline" onClick={exportExcel} disabled={!rows.length}>
                <Download className="h-4 w-4" />
                ייצוא ל-Excel
              </Button>
              <Button onClick={() => setAddOpen(true)} disabled={!yeshivaId}>
                <Plus className="h-4 w-4" />
                הוסף בחור
              </Button>
            </>
          }
        />

        {/* Toolbar: search + filters */}
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute inset-y-0 right-3 my-auto h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="חיפוש לפי שם או שם האב..."
              className="pr-9"
            />
          </div>

          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="שיעור" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל השיעורים</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="מצב" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל המצבים</SelectItem>
              {STUDENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {studentStatusLabels[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              ניקוי סינון
            </Button>
          )}
        </div>

        <DataTable<Row>
          key={`${search}|${classFilter}|${statusFilter}|${sort.key}|${sort.dir}`}
          columns={columns}
          data={rows}
          rowKey={(r) => r.student.id}
          pageSize={15}
          loading={loading}
          empty={emptyNode}
        />
      </div>

      {/* Add dialog */}
      <StudentFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        student={null}
        classes={classes}
        yeshivaId={yeshivaId}
      />
      {/* Edit dialog */}
      <StudentFormDialog
        open={!!editStudent}
        onOpenChange={(v) => !v && setEditStudent(null)}
        student={editStudent}
        classes={classes}
        yeshivaId={yeshivaId}
      />
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ *
 * Small presentational helpers
 * ------------------------------------------------------------------ */
function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

function RateCell({ stat }: { stat: StudentStats }) {
  if (stat.total === 0) {
    return <span className="text-xs text-muted-foreground">אין נתונים</span>;
  }
  const color =
    stat.rate >= 90
      ? "var(--status-on-time)"
      : stat.rate >= 75
        ? "var(--status-late-b)"
        : "var(--status-absent)";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex min-w-[130px] items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${stat.rate}%`, backgroundColor: color }}
            />
          </div>
          <span className="w-9 shrink-0 text-start text-xs font-medium tabular-nums">
            {stat.rate}%
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5 text-right text-xs">
          <div>
            נוכחות: {stat.present} מתוך {stat.total}
          </div>
          <div>
            בזמן {stat.onTime} · איחור ב׳ {stat.lateB} · איחור ג׳ {stat.lateC}
          </div>
          <div className="opacity-80">איחור נחשב כנוכחות</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function RowActions({
  student,
  onEdit,
  onDisable,
}: {
  student: Student;
  onEdit: (s: Student) => void;
  onDisable: (id: string) => Promise<unknown>;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="פתח כרטיס">
        <Link to="/students/$id" params={{ id: student.id }} aria-label="פתח כרטיס">
          <ExternalLink className="h-4 w-4" />
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title="עריכה"
        aria-label="עריכה"
        onClick={() => onEdit(student)}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <ConfirmDialog
        title="השבתת בחור"
        description={`להשבית את "${student.full_name}"? הבחור יוסתר מהרשימה אך כל הנתונים יישמרו.`}
        confirmText="השבת"
        cancelText="ביטול"
        destructive
        onConfirm={async () => {
          await onDisable(student.id);
        }}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            title="השבתה"
            aria-label="השבתה"
          >
            <Ban className="h-4 w-4" />
          </Button>
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Add / edit form dialog
 * ------------------------------------------------------------------ */
const PHONE_RE = /^[0-9+()\-\s]{6,20}$/;

const studentSchema = z.object({
  full_name: z.string().trim().min(2, "יש להזין שם מלא (לפחות 2 תווים)"),
  father_name: z.string().trim(),
  class_id: z.string(),
  phone: z.union([z.literal(""), z.string().trim().regex(PHONE_RE, "מספר טלפון אינו תקין")]),
  parent_phone: z.union([
    z.literal(""),
    z.string().trim().regex(PHONE_RE, "מספר טלפון אינו תקין"),
  ]),
  email: z.union([z.literal(""), z.string().trim().email("כתובת אימייל אינה תקינה")]),
  date_of_birth: z.string(),
  address: z.string().trim(),
  status: z.enum(STUDENT_STATUSES),
  notes: z.string().trim(),
});

type StudentFormValues = z.infer<typeof studentSchema>;

function toDefaults(s: Student | null): StudentFormValues {
  return {
    full_name: s?.full_name ?? "",
    father_name: s?.father_name ?? "",
    class_id: s?.class_id ?? "none",
    phone: s?.phone ?? "",
    parent_phone: s?.parent_phone ?? "",
    email: s?.email ?? "",
    date_of_birth: s?.date_of_birth ?? "",
    address: s?.address ?? "",
    status: s?.status ?? "active",
    notes: s?.notes ?? "",
  };
}

function StudentFormDialog({
  open,
  onOpenChange,
  student,
  classes,
  yeshivaId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  student: Student | null;
  classes: ClassRow[];
  yeshivaId: string | undefined;
}) {
  const qc = useQueryClient();
  const isEdit = !!student;

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: toDefaults(student),
  });

  // Re-seed the form each time the dialog opens (or the target changes).
  useEffect(() => {
    if (open) form.reset(toDefaults(student));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student]);

  const mutation = useMutation({
    mutationFn: async (values: StudentFormValues) => {
      const payload = {
        full_name: values.full_name,
        father_name: values.father_name || null,
        class_id: values.class_id && values.class_id !== "none" ? values.class_id : null,
        phone: values.phone || null,
        parent_phone: values.parent_phone || null,
        email: values.email || null,
        date_of_birth: values.date_of_birth || null,
        address: values.address || null,
        status: values.status,
        notes: values.notes || null,
      };
      if (student) {
        const { error } = await supabase.from("students").update(payload).eq("id", student.id);
        if (error) throw error;
      } else {
        if (!yeshivaId) throw new Error("לא נמצא מזהה ישיבה");
        const { error } = await supabase
          .from("students")
          .insert({ ...payload, yeshiva_id: yeshivaId, active: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "פרטי הבחור עודכנו בהצלחה" : "הבחור נוסף בהצלחה");
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["student-stats", yeshivaId] });
      if (student) qc.invalidateQueries({ queryKey: ["student", student.id] });
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      toast.error(isEdit ? "עדכון הבחור נכשל" : "הוספת הבחור נכשלה", {
        description: messageOf(e),
      });
    },
  });

  const onSubmit = form.handleSubmit((values) => mutation.mutate(values));

  return (
    <Dialog open={open} onOpenChange={(v) => !mutation.isPending && onOpenChange(v)}>
      <DialogContent dir="rtl" className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader className="text-right">
          <DialogTitle>{isEdit ? "עריכת פרטי בחור" : "הוספת בחור חדש"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "עדכנו את פרטי הבחור ולחצו על שמירה."
              : "מלאו את פרטי הבחור. שדות המסומנים ב-* הם חובה."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>שם מלא *</FormLabel>
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
                        <SelectItem value="none">ללא שיעור</SelectItem>
                        {classes.map((c) => (
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
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>טלפון</FormLabel>
                    <FormControl>
                      <Input dir="ltr" inputMode="tel" placeholder="050-0000000" {...field} />
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
                      <Input dir="ltr" inputMode="tel" placeholder="050-0000000" {...field} />
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
                      <Input dir="ltr" type="email" placeholder="name@example.com" {...field} />
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
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>מצב</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STUDENT_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {studentStatusLabels[s]}
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
                name="address"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
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
                  <FormItem className="sm:col-span-2">
                    <FormLabel>הערות</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder="הערות נוספות (אופציונלי)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="gap-2 sm:justify-start sm:space-x-0">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {isEdit ? "שמירת שינויים" : "הוספת בחור"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                ביטול
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * utils
 * ------------------------------------------------------------------ */
function messageOf(e: unknown): string | undefined {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return undefined;
}
