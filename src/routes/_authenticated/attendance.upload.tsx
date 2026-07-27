import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { safeStorageKey } from "@/lib/utils";
import { toast } from "sonner";
import { UploadCloud, Loader2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { PageHeader } from "@/components/AppShell";
import { SectionCard } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import {
  attendanceDocumentProcessor,
  resolveRoster,
} from "@/services/attendanceDocumentProcessor";

export const Route = createFileRoute("/_authenticated/attendance/upload")({
  component: UploadPage,
});

const ALL = "__all__";

const uploadSchema = z.object({
  date: z.string().min(1, "יש לבחור תאריך לדוח"),
  sessionId: z.string().min(1, "יש לבחור סדר לימוד"),
});

interface UploadPayload {
  date: string;
  sessionId: string;
  classId: string | null;
  notes: string | null;
  file: File | null;
}

function UploadPage() {
  const { user } = useAuth();
  const { data: profileData } = useProfile(user?.id);
  const yeshivaId = profileData?.profile?.yeshiva_id;
  const navigate = useNavigate();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState<string>(ALL);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<{ date?: string; sessionId?: string }>({});

  const { data: sessions } = useQuery({
    queryKey: ["sessions", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () =>
      (await supabase.from("study_sessions").select("id, name").eq("active", true).order("order_index"))
        .data ?? [],
  });
  const { data: classes } = useQuery({
    queryKey: ["classes-upload", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () =>
      (await supabase.from("classes").select("id, name").eq("active", true).order("name")).data ?? [],
  });

  const upload = useMutation({
    mutationFn: async (payload: UploadPayload) => {
      if (!yeshivaId) throw new Error("לא נמצא שיוך לישיבה.");

      // 1) העלאת הקובץ (אופציונלי)
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      if (payload.file) {
        const path = safeStorageKey(`${yeshivaId}/${payload.date}`, payload.file.name);
        const { error: upErr } = await supabase.storage
          .from("attendance-reports")
          .upload(path, payload.file);
        if (upErr) throw upErr;
        fileUrl = path;
        fileName = payload.file.name;
      }

      // 2) יצירת רשומת הדוח במצב "בעיבוד"
      const { data: report, error: rErr } = await supabase
        .from("attendance_reports")
        .insert({
          yeshiva_id: yeshivaId,
          report_date: payload.date,
          study_session_id: payload.sessionId,
          class_id: payload.classId,
          file_url: fileUrl,
          original_file_name: fileName,
          processing_status: "processing",
          uploaded_by: user?.id,
          notes: payload.notes,
        })
        .select()
        .single();
      if (rErr) throw rErr;

      // BUG B: כל כשל בעיבוד חייב להוריד את הדוח מ-"בעיבוד" ל-"נכשל" (לא להשאיר תקוע).
      try {
        // 3) שליפת רשימת הבחורים הרלוונטית
        let sq = supabase
          .from("students")
          .select("id, full_name")
          .eq("active", true)
          .eq("yeshiva_id", yeshivaId);
        if (payload.classId) sq = sq.eq("class_id", payload.classId);
        const { data: students, error: sErr } = await sq;
        if (sErr) throw sErr;
        const roster = students ?? [];
        if (!roster.length) throw new Error("לא נמצאו בחורים פעילים לשיוך לדוח.");

        const sessionName = sessions?.find((s) => s.id === payload.sessionId)?.name ?? null;
        const className = payload.classId
          ? (classes?.find((c) => c.id === payload.classId)?.name ?? null)
          : null;

        // 4) זיהוי אוטומטי (שירות מנותק — mock/OCR אמיתי)
        const { results, raw } = await attendanceDocumentProcessor.process({
          fileUrl: fileUrl ?? "",
          fileName,
          file: payload.file ?? null,
          students: roster,
          context: {
            studySessionId: payload.sessionId,
            studySessionName: sessionName,
            classId: payload.classId,
            className,
            reportDate: payload.date,
          },
        });

        // בחור שכלל לא הופיע בדף → מצב ניטרלי; בדף-ללא-סימון → נעדר; ודאות נמוכה → לבדיקה.
        const onSheetIds = Array.isArray((raw as { detected_order?: unknown }).detected_order)
          ? ((raw as { detected_order: string[] }).detected_order)
          : undefined;
        const resolved = resolveRoster(roster, results, undefined, onSheetIds);

        // BUG A: נכתבות אך ורק רשומות טיוטה (is_draft=true). שום דבר לא נספר
        // כנוכחות סופית עד לחיצה על "אשר ועדכן נוכחות" במסך האימות.
        const { error: recErr } = await supabase.from("attendance_records").upsert(
          resolved.records.map((r) => ({
            yeshiva_id: yeshivaId,
            student_id: r.student_id,
            attendance_report_id: report.id,
            report_date: payload.date,
            study_session_id: payload.sessionId,
            attendance_status: r.attendance_status,
            detected_automatically: r.detected_automatically,
            detection_confidence: r.detection_confidence,
            manually_verified: false,
            is_draft: true,
          })),
          { onConflict: "student_id,report_date,study_session_id" },
        );
        if (recErr) throw recErr;

        // 5) עדכון סטטוס הדוח לפי תוצאות הזיהוי
        const status = resolved.needsReview ? "needs_review" : "pending";
        const { error: updErr } = await supabase
          .from("attendance_reports")
          .update({ processing_status: status, ocr_raw_result: raw as unknown as Json })
          .eq("id", report.id);
        if (updErr) throw updErr;

        return { reportId: report.id as string, resolved, raw };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "שגיאה לא ידועה";
        await supabase
          .from("attendance_reports")
          .update({
            processing_status: "failed",
            notes: `${payload.notes ? payload.notes + " · " : ""}עיבוד נכשל: ${msg}`,
          })
          .eq("id", report.id);
        throw err;
      }
    },
    onSuccess: ({ reportId, resolved, raw }) => {
      const flagged =
        resolved.undetectedCount + resolved.lowConfidenceCount > 0
          ? ` ${resolved.undetectedCount + resolved.lowConfidenceCount} רשומות מסומנות לבדיקה.`
          : "";
      toast.success(
        `הזיהוי הראשוני הושלם עבור ${resolved.records.length} בחורים.${flagged} יש לאשר במסך האימות.`,
      );
      // חיווי אבחון — כמה שורות המנוע קרא, כמה הותאמו לרשימה, וכמה שמות לא הותאמו.
      const d = raw as {
        detected_rows?: number;
        matched?: number;
        unmatched_names?: string[];
      };
      toast.info(
        `זיהוי: נקראו ${d.detected_rows ?? 0} שורות · הותאמו ${d.matched ?? 0} · ` +
          `${d.unmatched_names?.length ?? 0} שמות לא הותאמו`,
        { duration: 12000 },
      );
      navigate({ to: "/attendance/verify/$id", params: { id: reportId } });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "אירעה שגיאה בהעלאת הדוח.");
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = uploadSchema.safeParse({ date, sessionId });
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        date: fieldErrors.date?.[0],
        sessionId: fieldErrors.sessionId?.[0],
      });
      return;
    }
    setErrors({});
    upload.mutate({
      date,
      sessionId,
      classId: classId === ALL ? null : classId,
      notes: notes.trim() || null,
      file,
    });
  }

  return (
    <div>
      <PageHeader
        title="העלאת דוח נוכחות"
        subtitle="העלו דוח סרוק — המערכת תבצע זיהוי ראשוני ותציג מסך אישור. הנתונים נשמרים כטיוטה בלבד עד לאישור."
      />

      <form onSubmit={onSubmit} className="max-w-2xl">
        <SectionCard
          title="פרטי הדוח"
          description="בחרו תאריך וסדר לימוד, צרפו את הסריקה, ולחצו על העלאה."
          icon={UploadCloud}
        >
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="report-date">תאריך הדוח</Label>
                <Input
                  id="report-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>סדר לימוד</Label>
                <Select value={sessionId || undefined} onValueChange={setSessionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחרו סדר לימוד..." />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {sessions?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.sessionId && (
                  <p className="text-xs text-destructive">{errors.sessionId}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>שיעור</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value={ALL}>כל הישיבה</SelectItem>
                  {classes?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                השאירו על "כל הישיבה" כדי לשייך את כל הבחורים הפעילים.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="report-file">קובץ סרוק</Label>
              <Input
                id="report-file"
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="cursor-pointer file:me-3 file:cursor-pointer"
              />
              {file ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  {file.name}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">JPG · PNG · PDF · DOC</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="report-notes">הערה</Label>
              <Textarea
                id="report-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="הערה חופשית (אופציונלי)"
              />
            </div>

            <div className="flex justify-start pt-1">
              <Button type="submit" disabled={upload.isPending}>
                {upload.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    מעבד זיהוי...
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4" />
                    העלה ותהליך זיהוי
                  </>
                )}
              </Button>
            </div>
          </div>
        </SectionCard>
      </form>
    </div>
  );
}
