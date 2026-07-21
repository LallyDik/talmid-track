import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  Filter,
  CheckCheck,
  Save,
  X,
  AlertTriangle,
  ClipboardCheck,
  Loader2,
  FileX,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { EmptyState, TableSkeleton, ConfirmDialog } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { attendanceShort, attendanceLabels, type AttendanceStatus } from "@/lib/hebrew";
import { LOW_CONFIDENCE_THRESHOLD } from "@/services/attendanceDocumentProcessor";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/attendance/verify/$id")({
  component: VerifyPage,
});

/** הסטטוסים המוצגים כעמודות במסך האימות (לפי דרישת ה-UI). */
const STATUS_COLS: AttendanceStatus[] = ["on_time", "late_b", "late_c", "absent", "excused"];

const statusVar: Record<AttendanceStatus, string> = {
  on_time: "var(--status-on-time)",
  late_b: "var(--status-late-b)",
  late_c: "var(--status-late-c)",
  absent: "var(--status-absent)",
  excused: "var(--status-excused)",
  unknown: "var(--status-unknown)",
};

const ALL = "__all__";

type StudentJoin = {
  full_name: string;
  class_id: string | null;
  classes: { name: string } | null;
} | null;

interface RecordRow {
  id: string;
  yeshiva_id: string;
  student_id: string;
  attendance_report_id: string | null;
  report_date: string;
  study_session_id: string;
  attendance_status: AttendanceStatus;
  detection_confidence: number | null;
  detected_automatically: boolean;
  manually_verified: boolean;
  verified_by: string | null;
  notes: string | null;
  is_draft: boolean;
  students: StudentJoin;
}

const GRID_COLS =
  "grid grid-cols-[minmax(8rem,1.5fr)_minmax(4.5rem,0.8fr)_repeat(5,2.75rem)_3.5rem_minmax(9rem,1.4fr)] items-center";

function VerifyPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ["report", id],
    queryFn: async () =>
      (
        await supabase
          .from("attendance_reports")
          .select("*, study_sessions(name), classes(name)")
          .eq("id", id)
          .single()
      ).data,
  });

  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ["report-records", id],
    queryFn: async () =>
      ((
        await supabase
          .from("attendance_records")
          .select(
            "*, students(full_name, class_id, classes(name))",
          )
          .eq("attendance_report_id", id)
      ).data ?? []) as unknown as RecordRow[],
  });

  // ── מצב עריכה מקומי ──────────────────────────────────────────────────────
  const [edits, setEdits] = useState<Record<string, { status: AttendanceStatus; note: string }>>({});
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [onlyUnrecognized, setOnlyUnrecognized] = useState(false);
  const [classFilter, setClassFilter] = useState<string>(ALL);

  // ── מציג הקובץ: זום + ניווט עמודים ───────────────────────────────────────
  const [fileSignedUrl, setFileSignedUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (report?.file_url) {
      supabase.storage
        .from("attendance-reports")
        .createSignedUrl(report.file_url, 3600)
        .then(({ data }) => setFileSignedUrl(data?.signedUrl ?? null));
    }
  }, [report?.file_url]);

  const recordsById = useMemo(() => {
    const m = new Map<string, RecordRow>();
    (records ?? []).forEach((r) => m.set(r.id, r));
    return m;
  }, [records]);

  const sortedRecords = useMemo(
    () =>
      [...(records ?? [])].sort((a, b) =>
        (a.students?.full_name ?? "").localeCompare(b.students?.full_name ?? "", "he"),
      ),
    [records],
  );

  const rawResult = report?.ocr_raw_result as { page_count?: number } | null;
  const pageCount = Math.max(1, Number(rawResult?.page_count ?? 1) || 1);
  const isPdf =
    /\.pdf$/i.test(report?.original_file_name ?? "") || /\.pdf$/i.test(report?.file_url ?? "");

  // ── עוזרי גישה למצב הנוכחי (עריכה מקומית מעל ערך ה-DB) ────────────────────
  const current = (r: RecordRow): AttendanceStatus =>
    edits[r.id]?.status ?? r.attendance_status;
  const noteVal = (r: RecordRow): string => edits[r.id]?.note ?? r.notes ?? "";

  const isLowConfidence = (r: RecordRow): boolean =>
    !r.detected_automatically ||
    r.detection_confidence == null ||
    r.detection_confidence < LOW_CONFIDENCE_THRESHOLD;
  const isFlagged = (r: RecordRow): boolean => isLowConfidence(r) && !reviewed.has(r.id);

  function setStatus(id: string, status: AttendanceStatus) {
    setEdits((e) => ({
      ...e,
      [id]: { status, note: e[id]?.note ?? recordsById.get(id)?.notes ?? "" },
    }));
    setReviewed((s) => new Set(s).add(id));
  }
  function setNote(id: string, note: string) {
    setEdits((e) => ({
      ...e,
      [id]: {
        status: e[id]?.status ?? recordsById.get(id)?.attendance_status ?? "absent",
        note,
      },
    }));
  }

  function markAllReviewed() {
    setReviewed(new Set(sortedRecords.map((r) => r.id)));
    toast.success("כל הרשומות סומנו כמאושרות. ניתן לאשר ולעדכן נוכחות.");
  }

  // אפשרויות סינון לפי שיעור (נגזר מהרשומות)
  const classOptions = useMemo(() => {
    const m = new Map<string, string>();
    (records ?? []).forEach((r) => {
      const cid = r.students?.class_id ?? "none";
      const name = r.students?.classes?.name ?? "ללא שיעור";
      if (!m.has(cid)) m.set(cid, name);
    });
    return Array.from(m, ([value, label]) => ({ value, label }));
  }, [records]);

  const visible = useMemo(
    () =>
      sortedRecords.filter((r) => {
        if (onlyUnrecognized && !isLowConfidence(r)) return false;
        if (classFilter !== ALL && (r.students?.class_id ?? "none") !== classFilter) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sortedRecords, onlyUnrecognized, classFilter],
  );

  const flaggedCount = useMemo(
    () => sortedRecords.filter(isLowConfidence).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sortedRecords],
  );

  // ── מוטציות ──────────────────────────────────────────────────────────────
  function buildRows(draft: boolean) {
    return sortedRecords.map((r) => ({
      id: r.id,
      yeshiva_id: r.yeshiva_id,
      student_id: r.student_id,
      attendance_report_id: r.attendance_report_id,
      report_date: r.report_date,
      study_session_id: r.study_session_id,
      attendance_status: current(r),
      detection_confidence: r.detection_confidence,
      detected_automatically: r.detected_automatically,
      notes: noteVal(r).trim() || null,
      manually_verified: !draft,
      verified_by: draft ? r.verified_by : (user?.id ?? null),
      is_draft: draft,
    }));
  }

  // BUG E: העדכון מבוצע ב-upsert מרוכז יחיד, לא בלולאה של עדכוני-שורה.
  const saveDraft = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("attendance_records")
        .upsert(buildRows(true), { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-records", id] });
      toast.success("הטיוטה נשמרה. הנוכחות עדיין לא עודכנה סופית.");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "שמירת הטיוטה נכשלה."),
  });

  const approve = useMutation({
    mutationFn: async () => {
      // BUG A: רק כאן is_draft הופך ל-false ו-processing_status ל-approved.
      const { error } = await supabase
        .from("attendance_records")
        .upsert(buildRows(false), { onConflict: "id" });
      if (error) throw error;
      const { error: rErr } = await supabase
        .from("attendance_reports")
        .update({ processing_status: "approved" })
        .eq("id", id);
      if (rErr) throw rErr;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("הנוכחות אושרה ועודכנה בהצלחה.");
      navigate({ to: "/attendance/reports" });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "אישור הנוכחות נכשל."),
  });

  async function handleApprove() {
    // "מוצדק" מצריך הערה (required-ish)
    const missing = sortedRecords.filter(
      (r) => current(r) === "excused" && !noteVal(r).trim(),
    );
    if (missing.length) {
      toast.error(`יש להזין הערה עבור ${missing.length} רשומות שסומנו כ"מוצדק".`);
      throw new Error("missing-excuse-note");
    }
    await approve.mutateAsync();
  }

  const busy = approve.isPending || saveDraft.isPending;

  return (
    <div>
      <PageHeader
        title="אימות דוח נוכחות"
        subtitle={
          report
            ? `${report.report_date} · ${(report.study_sessions as { name: string } | null)?.name ?? ""} · ${
                (report.classes as { name: string } | null)?.name ?? "כל הישיבה"
              }`
            : "טוען..."
        }
        actions={
          <>
            <Button
              variant="ghost"
              onClick={() => navigate({ to: "/attendance/reports" })}
              disabled={busy}
            >
              <X className="h-4 w-4" />
              ביטול
            </Button>
            <Button
              variant="outline"
              onClick={() => saveDraft.mutate()}
              disabled={busy || !sortedRecords.length}
            >
              {saveDraft.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              שמור טיוטה
            </Button>
            <ConfirmDialog
              trigger={
                <Button disabled={busy || !sortedRecords.length}>
                  {approve.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ClipboardCheck className="h-4 w-4" />
                  )}
                  אשר ועדכן נוכחות
                </Button>
              }
              title="אישור ועדכון נוכחות"
              description="הרשומות ייכתבו כנוכחות סופית ויופיעו בכל הדוחות והלוחות. פעולה זו סוגרת את הדוח לאישור."
              confirmText="אשר ועדכן נוכחות"
              onConfirm={handleApprove}
            />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── ימין: הקובץ הסרוק + כלי זום/עמודים ── */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/60 px-3 py-2">
            <span className="text-sm font-medium">הקובץ הסרוק</span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                disabled={!fileSignedUrl || zoom <= 0.5}
                aria-label="הקטן תצוגה"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                disabled={!fileSignedUrl || zoom >= 3}
                aria-label="הגדל תצוגה"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setZoom(1);
                  setPage(1);
                }}
                disabled={!fileSignedUrl}
                aria-label="אפס תצוגה"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>

              {isPdf && pageCount > 1 && (
                <div className="ms-1 flex items-center gap-1 border-s border-border ps-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={page >= pageCount}
                    aria-label="העמוד הבא"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {page}/{pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    aria-label="העמוד הקודם"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="h-[76vh] overflow-auto bg-muted/20 p-3">
            {reportLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                טוען...
              </div>
            ) : fileSignedUrl ? (
              isPdf ? (
                <iframe
                  key={`${page}-${zoom}`}
                  src={`${fileSignedUrl}#page=${page}&view=FitH&zoom=${Math.round(zoom * 100)}`}
                  className="h-full w-full rounded-lg border border-border bg-white"
                  title="הקובץ הסרוק"
                />
              ) : (
                <img
                  src={fileSignedUrl}
                  alt="הדוח הסרוק"
                  className="mx-auto h-auto rounded-lg"
                  style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
                />
              )
            ) : (
              <EmptyState
                icon={FileX}
                title="לא הועלה קובץ"
                description="לדוח זה לא צורפה סריקה. ניתן לאמת את הסימונים ידנית."
              />
            )}
          </div>
        </div>

        {/* ── שמאל: טבלת הבחורים ── */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/60 px-3 py-2">
            <div className="text-sm font-medium">
              סימוני נוכחות
              <span className="ms-2 text-xs font-normal text-muted-foreground">
                {sortedRecords.length} בחורים
                {flaggedCount > 0 && ` · ${flaggedCount} דורשים בדיקה`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={markAllReviewed} disabled={!sortedRecords.length}>
                <CheckCheck className="h-4 w-4" />
                סמן הכל כמאושר
              </Button>
              <Button
                variant={onlyUnrecognized ? "default" : "outline"}
                size="sm"
                onClick={() => setOnlyUnrecognized((v) => !v)}
              >
                <Filter className="h-4 w-4" />
                שלא זוהו
              </Button>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="h-8 w-[9rem] text-xs">
                  <SelectValue placeholder="סינון לפי שיעור" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value={ALL}>כל השיעורים</SelectItem>
                  {classOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {recordsLoading ? (
            <div className="p-3">
              <TableSkeleton rows={8} columns={5} />
            </div>
          ) : !sortedRecords.length ? (
            <EmptyState
              className="m-3"
              icon={ClipboardCheck}
              title="אין רשומות לדוח זה"
              description="לא נוצרו רשומות נוכחות עבור דוח זה."
              action={
                <Button variant="outline" onClick={() => navigate({ to: "/attendance/reports" })}>
                  חזרה לרשימת הדוחות
                </Button>
              }
            />
          ) : (
            <div className="h-[76vh] overflow-auto">
              <div className="min-w-[46rem]">
                {/* כותרת הטבלה */}
                <div
                  className={cn(
                    GRID_COLS,
                    "sticky top-0 z-10 border-b border-border bg-muted/80 px-3 py-2 text-xs font-semibold text-muted-foreground backdrop-blur",
                  )}
                >
                  <div className="text-start">שם הבחור</div>
                  <div className="text-start">שיעור</div>
                  {STATUS_COLS.map((s) => (
                    <div key={s} className="text-center" title={attendanceLabels[s]}>
                      {attendanceShort[s]}
                    </div>
                  ))}
                  <div className="text-center">ודאות</div>
                  <div className="text-start">הערה</div>
                </div>

                {visible.length === 0 ? (
                  <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                    לא נמצאו רשומות תואמות לסינון.
                  </div>
                ) : (
                  visible.map((r) => {
                    const flagged = isFlagged(r);
                    const cur = current(r);
                    const needsExcuseNote = cur === "excused" && !noteVal(r).trim();
                    return (
                      <div
                        key={r.id}
                        className={cn(
                          GRID_COLS,
                          "border-b border-border/60 px-3 py-1.5 text-sm transition-colors",
                        )}
                        style={
                          flagged
                            ? { backgroundColor: "color-mix(in oklch, var(--status-late-b) 14%, transparent)" }
                            : undefined
                        }
                      >
                        <div className="flex min-w-0 items-center gap-1.5 font-medium">
                          {flagged && (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[color:var(--status-late-c)]" />
                          )}
                          <span className="truncate">{r.students?.full_name ?? "—"}</span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {r.students?.classes?.name ?? "—"}
                        </div>

                        <RadioGroup
                          className="contents"
                          value={cur}
                          onValueChange={(v) => setStatus(r.id, v as AttendanceStatus)}
                        >
                          {STATUS_COLS.map((s) => (
                            <label
                              key={s}
                              style={{ ["--rc" as string]: statusVar[s] }}
                              className="flex items-center justify-center py-0.5"
                            >
                              <RadioGroupItem value={s} className="peer sr-only" />
                              <span
                                aria-hidden
                                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border text-[11px] font-semibold text-muted-foreground transition-colors hover:border-[color:var(--rc)] peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-data-[state=checked]:border-transparent peer-data-[state=checked]:text-white peer-data-[state=checked]:[background-color:var(--rc)]"
                              >
                                {attendanceShort[s]}
                              </span>
                            </label>
                          ))}
                        </RadioGroup>

                        <div
                          className={cn(
                            "text-center text-xs tabular-nums",
                            isLowConfidence(r)
                              ? "font-semibold text-[color:var(--status-late-c)]"
                              : "text-muted-foreground",
                          )}
                        >
                          {r.detection_confidence != null
                            ? `${Math.round(r.detection_confidence * 100)}%`
                            : "—"}
                        </div>

                        <Input
                          value={noteVal(r)}
                          onChange={(e) => setNote(r.id, e.target.value)}
                          placeholder={cur === "excused" ? "חובה: סיבת ההיצדקות" : "הערה"}
                          className={cn(
                            "h-8 text-xs",
                            needsExcuseNote && "border-destructive focus-visible:ring-destructive",
                          )}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* מקרא */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">מקרא:</span>
        {STATUS_COLS.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: statusVar[s] }}
            />
            {attendanceLabels[s]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-[color:var(--status-late-c)]" />
          רמת ודאות נמוכה — נדרשת בדיקה
        </span>
      </div>

      {report && !fileSignedUrl && report.file_url && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          טוען את הקובץ הסרוק...
        </div>
      )}
    </div>
  );
}
