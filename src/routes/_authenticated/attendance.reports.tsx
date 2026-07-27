import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  FileStack,
  Plus,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  FilterX,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { PageHeader } from "@/components/AppShell";
import { EmptyState, StatusBadge, TableSkeleton } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  reportStatusLabels,
  formatHebrewDate,
  formatHebrewDateTime,
  type ReportStatus,
} from "@/lib/hebrew";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import {
  attendanceDocumentProcessor,
  resolveRoster,
} from "@/services/attendanceDocumentProcessor";

export const Route = createFileRoute("/_authenticated/attendance/reports")({
  component: ReportsPage,
});

const ALL = "__all__";
const NO_CLASS = "__none__";
const PAGE_SIZE = 20;

interface ReportRow {
  id: string;
  report_date: string;
  study_session_id: string;
  class_id: string | null;
  file_url: string | null;
  original_file_name: string | null;
  processing_status: ReportStatus;
  uploaded_at: string;
  notes: string | null;
  study_sessions: { name: string } | null;
  classes: { name: string } | null;
}

/** סטטוסים שניתן להריץ עבורם עיבוד חוזר (תקועים / נכשלו). */
const RETRYABLE: ReportStatus[] = ["processing", "failed"];

function ReportsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: profileData } = useProfile(user?.id);
  const yeshivaId = profileData?.profile?.yeshiva_id;

  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sessionFilter, setSessionFilter] = useState(ALL);
  const [classFilter, setClassFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);

  // איפוס העמוד בכל שינוי סינון
  function withPageReset<T>(setter: (v: T) => void) {
    return (v: T) => {
      setPage(0);
      setter(v);
    };
  }

  const { data: sessions } = useQuery({
    queryKey: ["sessions", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () =>
      (await supabase.from("study_sessions").select("id, name").order("order_index")).data ?? [],
  });
  const { data: classes } = useQuery({
    queryKey: ["classes-list", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => (await supabase.from("classes").select("id, name").order("name")).data ?? [],
  });

  const { data, isLoading } = useQuery({
    queryKey: [
      "reports",
      yeshivaId,
      page,
      dateFrom,
      dateTo,
      sessionFilter,
      classFilter,
      statusFilter,
    ],
    enabled: !!yeshivaId,
    queryFn: async () => {
      let q = supabase
        .from("attendance_reports")
        .select("*, study_sessions(name), classes(name)", { count: "exact" })
        .order("uploaded_at", { ascending: false });

      if (dateFrom) q = q.gte("report_date", dateFrom);
      if (dateTo) q = q.lte("report_date", dateTo);
      if (sessionFilter !== ALL) q = q.eq("study_session_id", sessionFilter);
      if (classFilter !== ALL)
        q = classFilter === NO_CLASS ? q.is("class_id", null) : q.eq("class_id", classFilter);
      if (statusFilter !== ALL)
        q = q.eq("processing_status", statusFilter as ReportStatus);

      const from = page * PAGE_SIZE;
      const { data, count, error } = await q.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as ReportRow[], count: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters =
    !!dateFrom || !!dateTo || sessionFilter !== ALL || classFilter !== ALL || statusFilter !== ALL;

  function clearFilters() {
    setPage(0);
    setDateFrom("");
    setDateTo("");
    setSessionFilter(ALL);
    setClassFilter(ALL);
    setStatusFilter(ALL);
  }

  // BUG B: עיבוד חוזר לדוחות תקועים ("בעיבוד") או שנכשלו.
  const retry = useMutation({
    mutationFn: async (report: ReportRow) => {
      if (!yeshivaId) throw new Error("לא נמצא שיוך לישיבה.");
      await supabase
        .from("attendance_reports")
        .update({ processing_status: "processing" })
        .eq("id", report.id);

      try {
        let sq = supabase
          .from("students")
          .select("id, full_name")
          .eq("active", true)
          .eq("yeshiva_id", yeshivaId);
        if (report.class_id) sq = sq.eq("class_id", report.class_id);
        const { data: students, error: sErr } = await sq;
        if (sErr) throw sErr;
        const roster = students ?? [];
        if (!roster.length) throw new Error("לא נמצאו בחורים פעילים לשיוך לדוח.");

        const { results, raw } = await attendanceDocumentProcessor.process({
          fileUrl: report.file_url ?? "",
          fileName: report.original_file_name,
          students: roster,
          context: {
            studySessionId: report.study_session_id,
            classId: report.class_id,
            reportDate: report.report_date,
          },
        });
        const resolved = resolveRoster(roster, results);

        // ניקוי טיוטות קודמות של הדוח לפני כתיבה מחדש (רשומות מאושרות לא נמחקות).
        await supabase
          .from("attendance_records")
          .delete()
          .eq("attendance_report_id", report.id)
          .eq("is_draft", true);

        const { error: recErr } = await supabase.from("attendance_records").upsert(
          resolved.records.map((r) => ({
            yeshiva_id: yeshivaId,
            student_id: r.student_id,
            attendance_report_id: report.id,
            report_date: report.report_date,
            study_session_id: report.study_session_id,
            attendance_status: r.attendance_status,
            detected_automatically: r.detected_automatically,
            detection_confidence: r.detection_confidence,
            manually_verified: false,
            is_draft: true,
          })),
          { onConflict: "student_id,report_date,study_session_id" },
        );
        if (recErr) throw recErr;

        const { error: updErr } = await supabase
          .from("attendance_reports")
          .update({
            processing_status: resolved.needsReview ? "needs_review" : "pending",
            ocr_raw_result: raw as unknown as Json,
          })
          .eq("id", report.id);
        if (updErr) throw updErr;

        return report.id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "שגיאה לא ידועה";
        await supabase
          .from("attendance_reports")
          .update({ processing_status: "failed", notes: `עיבוד חוזר נכשל: ${msg}` })
          .eq("id", report.id);
        throw err;
      }
    },
    onSuccess: (reportId) => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      toast.success("העיבוד בוצע מחדש בהצלחה. ניתן לאמת את הדוח.");
      navigate({ to: "/attendance/verify/$id", params: { id: reportId } });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "העיבוד החוזר נכשל."),
  });

  return (
    <div>
      <PageHeader
        title="דוחות נוכחות"
        subtitle="דוחות שהועלו למערכת"
        actions={
          <Button asChild>
            <Link to="/attendance/upload">
              <Plus className="h-4 w-4" />
              העלאת דוח
            </Link>
          </Button>
        }
      />

      {/* סרגל סינון */}
      <div className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="date-from" className="text-xs text-muted-foreground">
              מתאריך
            </Label>
            <Input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => withPageReset(setDateFrom)(e.target.value)}
            />
            {dateFrom && (
              <p className="text-[11px] text-muted-foreground">{formatHebrewDate(dateFrom)}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="date-to" className="text-xs text-muted-foreground">
              עד תאריך
            </Label>
            <Input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => withPageReset(setDateTo)(e.target.value)}
            />
            {dateTo && (
              <p className="text-[11px] text-muted-foreground">{formatHebrewDate(dateTo)}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">סדר לימוד</Label>
            <Select value={sessionFilter} onValueChange={withPageReset(setSessionFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value={ALL}>כל הסדרים</SelectItem>
                {sessions?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">שיעור</Label>
            <Select value={classFilter} onValueChange={withPageReset(setClassFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value={ALL}>כל השיעורים</SelectItem>
                <SelectItem value={NO_CLASS}>כל הישיבה</SelectItem>
                {classes?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">סטטוס</Label>
            <Select value={statusFilter} onValueChange={withPageReset(setStatusFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value={ALL}>כל הסטטוסים</SelectItem>
                {(Object.keys(reportStatusLabels) as ReportStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {reportStatusLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {hasFilters && (
          <div className="mt-3 flex justify-start">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <FilterX className="h-4 w-4" />
              נקה סינון
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} columns={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileStack}
          title={hasFilters ? "לא נמצאו דוחות תואמים" : "אין דוחות עדיין"}
          description={
            hasFilters
              ? "נסו לשנות את הסינון או לנקות אותו."
              : "העלו דוח נוכחות סרוק כדי להתחיל בזיהוי אוטומטי."
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                <FilterX className="h-4 w-4" />
                נקה סינון
              </Button>
            ) : (
              <Button asChild>
                <Link to="/attendance/upload">
                  <Plus className="h-4 w-4" />
                  העלאת דוח
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="bg-muted/70 px-4 py-3 text-start text-xs font-semibold text-muted-foreground">
                    תאריך
                  </th>
                  <th className="bg-muted/70 px-4 py-3 text-start text-xs font-semibold text-muted-foreground">
                    סדר
                  </th>
                  <th className="bg-muted/70 px-4 py-3 text-start text-xs font-semibold text-muted-foreground">
                    שיעור
                  </th>
                  <th className="bg-muted/70 px-4 py-3 text-start text-xs font-semibold text-muted-foreground">
                    סטטוס
                  </th>
                  <th className="bg-muted/70 px-4 py-3 text-start text-xs font-semibold text-muted-foreground">
                    הועלה
                  </th>
                  <th className="bg-muted/70 px-4 py-3 text-start text-xs font-semibold text-muted-foreground">
                    פעולות
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.id}
                    className={cn(
                      "border-b border-border/70 last:border-0",
                      i % 2 === 1 && "bg-muted/25",
                    )}
                  >
                    <td className="px-4 py-3 font-medium">{r.report_date}</td>
                    <td className="px-4 py-3">{r.study_sessions?.name ?? "—"}</td>
                    <td className="px-4 py-3">{r.classes?.name ?? "כל הישיבה"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge kind="report" status={r.processing_status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatHebrewDateTime(r.uploaded_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          to="/attendance/verify/$id"
                          params={{ id: r.id }}
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          פתח לאימות
                          <ArrowLeft className="h-3.5 w-3.5" />
                        </Link>
                        {RETRYABLE.includes(r.processing_status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => retry.mutate(r)}
                            disabled={retry.isPending}
                          >
                            {retry.isPending && retry.variables?.id === r.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            נסה שוב
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-2.5">
            <p className="text-xs text-muted-foreground">
              מציג {total === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} מתוך{" "}
              {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronRight className="h-4 w-4" />
                הקודם
              </Button>
              <span className="text-xs text-muted-foreground">
                עמוד {page + 1} מתוך {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
              >
                הבא
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
