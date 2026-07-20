import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { attendanceDocumentProcessor } from "@/services/attendanceDocumentProcessor";

export const Route = createFileRoute("/_authenticated/attendance/upload")({
  component: UploadPage,
});

function UploadPage() {
  const { user } = useAuth();
  const { data: profileData } = useProfile(user?.id);
  const yeshivaId = profileData?.profile?.yeshiva_id;
  const navigate = useNavigate();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: sessions } = useQuery({
    queryKey: ["sessions", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => (await supabase.from("study_sessions").select("*").order("order_index")).data ?? [],
  });
  const { data: classes } = useQuery({
    queryKey: ["classes-upload", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => (await supabase.from("classes").select("id, name").eq("active", true)).data ?? [],
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!yeshivaId || !sessionId) return;
    setLoading(true);
    setError(null);
    try {
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      if (file) {
        const path = `${yeshivaId}/${date}/${crypto.randomUUID()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("attendance-reports").upload(path, file);
        if (upErr) throw upErr;
        fileUrl = path;
        fileName = file.name;
      }

      const { data: report, error: rErr } = await supabase
        .from("attendance_reports")
        .insert({
          yeshiva_id: yeshivaId,
          report_date: date,
          study_session_id: sessionId,
          class_id: classId || null,
          file_url: fileUrl,
          original_file_name: fileName,
          processing_status: "processing",
          uploaded_by: user?.id,
          notes: notes || null,
        })
        .select()
        .single();
      if (rErr) throw rErr;

      // Fetch relevant students
      let sq = supabase.from("students").select("id, full_name").eq("active", true);
      if (classId) sq = sq.eq("class_id", classId);
      const { data: students } = await sq;

      // Mock OCR
      const { results, raw } = await attendanceDocumentProcessor.process({
        fileUrl: fileUrl ?? "",
        students: students ?? [],
      });

      // Create draft records (unverified)
      if (results.length) {
        await supabase.from("attendance_records").upsert(
          results.map((r) => ({
            yeshiva_id: yeshivaId,
            student_id: r.student_id,
            attendance_report_id: report.id,
            report_date: date,
            study_session_id: sessionId,
            attendance_status: r.attendance_status,
            detected_automatically: true,
            detection_confidence: r.detection_confidence,
            manually_verified: false,
          })),
          { onConflict: "student_id,report_date,study_session_id" }
        );
      }

      await supabase
        .from("attendance_reports")
        .update({ processing_status: "needs_review", ocr_raw_result: raw as unknown as Record<string, string | number> })
        .eq("id", report.id);

      navigate({ to: "/attendance/verify/$id", params: { id: report.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title="העלאת דוח נוכחות" subtitle="העלה דוח סרוק — המערכת תבצע זיהוי ראשוני ותציג מסך אישור" />
      <form onSubmit={submit} className="bg-card border border-border rounded-xl p-6 max-w-2xl space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">תאריך הדוח</label>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-md border border-input px-3 py-2 bg-background" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">סדר לימוד</label>
            <select required value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="w-full rounded-md border border-input px-3 py-2 bg-background">
              <option value="">בחר...</option>
              {sessions?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">שיעור (או ריק לכל הישיבה)</label>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-full rounded-md border border-input px-3 py-2 bg-background">
            <option value="">כל הישיבה</option>
            {classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">קובץ סרוק (JPG / PNG / PDF / DOC)</label>
          <input type="file" accept="image/*,.pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">הערה</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-md border border-input px-3 py-2 bg-background" />
        </div>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <button type="submit" disabled={loading} className="rounded-md bg-primary text-primary-foreground px-5 py-2 disabled:opacity-50">
          {loading ? "מעבד..." : "העלה ותהליך זיהוי"}
        </button>
      </form>
    </div>
  );
}