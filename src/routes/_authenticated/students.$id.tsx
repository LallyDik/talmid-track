import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { attendanceLabels, attendanceClass, type AttendanceStatus, studentStatusLabels, type StudentStatus } from "@/lib/hebrew";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

export const Route = createFileRoute("/_authenticated/students/$id")({
  component: StudentPage,
});

type Tab = "details" | "attendance" | "events" | "treatments";

function StudentPage() {
  const { id } = Route.useParams();
  const [tab, setTab] = useState<Tab>("details");
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: profileData } = useProfile(user?.id);
  const yeshivaId = profileData?.profile?.yeshiva_id;

  const { data: student } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("*, classes(name)").eq("id", id).maybeSingle();
      return data;
    },
  });

  const { data: records } = useQuery({
    queryKey: ["student-records", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("*, study_sessions(name)")
        .eq("student_id", id)
        .order("report_date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: events } = useQuery({
    queryKey: ["student-events", id],
    queryFn: async () => (await supabase.from("student_events").select("*").eq("student_id", id).order("event_date", { ascending: false })).data ?? [],
  });

  const { data: treatments } = useQuery({
    queryKey: ["student-treatments", id],
    queryFn: async () => (await supabase.from("student_treatments").select("*").eq("student_id", id).order("opened_at", { ascending: false })).data ?? [],
  });

  const total = records?.length ?? 0;
  const onTime = records?.filter((r) => r.attendance_status === "on_time").length ?? 0;
  const late = records?.filter((r) => r.attendance_status === "late_b" || r.attendance_status === "late_c").length ?? 0;
  const absent = records?.filter((r) => r.attendance_status === "absent").length ?? 0;
  const rate = total ? Math.round(((onTime + late) / total) * 100) : 0;

  const [newEvent, setNewEvent] = useState({ title: "", description: "", event_type: "הערה כללית", severity: "info" });
  const addEvent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("student_events").insert({
        yeshiva_id: yeshivaId!,
        student_id: id,
        title: newEvent.title,
        description: newEvent.description || null,
        event_type: newEvent.event_type,
        severity: newEvent.severity as "info" | "low" | "medium" | "high" | "urgent",
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewEvent({ title: "", description: "", event_type: "הערה כללית", severity: "info" });
      qc.invalidateQueries({ queryKey: ["student-events", id] });
    },
  });

  const [newTreatment, setNewTreatment] = useState({ title: "", description: "", due_date: "" });
  const addTreatment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("student_treatments").insert({
        yeshiva_id: yeshivaId!,
        student_id: id,
        title: newTreatment.title,
        description: newTreatment.description || null,
        due_date: newTreatment.due_date || null,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewTreatment({ title: "", description: "", due_date: "" });
      qc.invalidateQueries({ queryKey: ["student-treatments", id] });
    },
  });

  if (!student) return <div>טוען...</div>;

  return (
    <div>
      <div className="mb-4">
        <Link to="/students" className="text-sm text-primary">→ חזרה לרשימה</Link>
      </div>
      <PageHeader
        title={student.full_name}
        subtitle={`בן ${student.father_name ?? "—"} · ${(student.classes as { name: string } | null)?.name ?? "ללא שיעור"}`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground">אחוז נוכחות</div>
          <div className="text-2xl font-bold">{rate}%</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground">איחורים</div>
          <div className="text-2xl font-bold">{late}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground">היעדרויות</div>
          <div className="text-2xl font-bold">{absent}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground">טיפולים פתוחים</div>
          <div className="text-2xl font-bold">{treatments?.filter((t) => t.status !== "completed" && t.status !== "cancelled").length ?? 0}</div>
        </div>
      </div>

      <div className="border-b border-border mb-6 flex gap-1">
        {(["details", "attendance", "events", "treatments"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px ${tab === t ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground"}`}
          >
            {t === "details" ? "פרטים" : t === "attendance" ? "נוכחות" : t === "events" ? "אירועים" : "טיפולים"}
          </button>
        ))}
      </div>

      {tab === "details" && (
        <div className="bg-card border border-border rounded-xl p-6 max-w-2xl space-y-3">
          <Row label="שם מלא" value={student.full_name} />
          <Row label="שם האב" value={student.father_name ?? "—"} />
          <Row label="טלפון" value={student.phone ?? "—"} />
          <Row label="טלפון הורים" value={student.parent_phone ?? "—"} />
          <Row label="אימייל" value={student.email ?? "—"} />
          <Row label="כתובת" value={student.address ?? "—"} />
          <Row label="סטטוס" value={studentStatusLabels[student.status as StudentStatus]} />
          <Row label="הערות" value={student.notes ?? "—"} />
        </div>
      )}

      {tab === "attendance" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-right px-4 py-2">תאריך</th>
                <th className="text-right px-4 py-2">סדר</th>
                <th className="text-right px-4 py-2">סטטוס</th>
                <th className="text-right px-4 py-2">מקור</th>
                <th className="text-right px-4 py-2">הערה</th>
              </tr>
            </thead>
            <tbody>
              {records?.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2">{r.report_date}</td>
                  <td className="px-4 py-2">{(r.study_sessions as { name: string } | null)?.name}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${attendanceClass[r.attendance_status as AttendanceStatus]}`}>
                      {attendanceLabels[r.attendance_status as AttendanceStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-2">{r.detected_automatically ? "אוטומטי" : "ידני"}</td>
                  <td className="px-4 py-2">{r.notes ?? "—"}</td>
                </tr>
              ))}
              {records && !records.length && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">אין רשומות נוכחות</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "events" && (
        <div>
          <div className="bg-card border border-border rounded-xl p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input placeholder="כותרת" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} className="rounded-md border border-input px-3 py-2 bg-background" />
              <select value={newEvent.event_type} onChange={(e) => setNewEvent({ ...newEvent, event_type: e.target.value })} className="rounded-md border border-input px-3 py-2 bg-background">
                <option>איחור חוזר</option>
                <option>היעדרות</option>
                <option>שיחה עם הבחור</option>
                <option>שיחה עם ההורים</option>
                <option>הישג חיובי</option>
                <option>אירוע משמעתי</option>
                <option>אירוע רפואי</option>
                <option>הערה כללית</option>
                <option>אחר</option>
              </select>
              <select value={newEvent.severity} onChange={(e) => setNewEvent({ ...newEvent, severity: e.target.value })} className="rounded-md border border-input px-3 py-2 bg-background">
                <option value="info">מידע</option>
                <option value="low">נמוכה</option>
                <option value="medium">בינונית</option>
                <option value="high">גבוהה</option>
                <option value="urgent">דחופה</option>
              </select>
              <button onClick={() => newEvent.title.trim() && addEvent.mutate()} className="rounded-md bg-primary text-primary-foreground px-4 py-2">הוסף</button>
            </div>
            <textarea placeholder="תיאור (אופציונלי)" value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} className="w-full rounded-md border border-input px-3 py-2 bg-background mt-2" rows={2} />
          </div>
          <div className="space-y-2">
            {events?.map((ev) => (
              <div key={ev.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex justify-between">
                  <div className="font-medium">{ev.title}</div>
                  <div className="text-xs text-muted-foreground">{ev.event_date} · {ev.event_type}</div>
                </div>
                {ev.description && <div className="text-sm text-muted-foreground mt-1">{ev.description}</div>}
              </div>
            ))}
            {events && !events.length && <div className="text-center py-8 text-muted-foreground">אין אירועים</div>}
          </div>
        </div>
      )}

      {tab === "treatments" && (
        <div>
          <div className="bg-card border border-border rounded-xl p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input placeholder="כותרת" value={newTreatment.title} onChange={(e) => setNewTreatment({ ...newTreatment, title: e.target.value })} className="rounded-md border border-input px-3 py-2 bg-background" />
              <input type="date" value={newTreatment.due_date} onChange={(e) => setNewTreatment({ ...newTreatment, due_date: e.target.value })} className="rounded-md border border-input px-3 py-2 bg-background" />
              <button onClick={() => newTreatment.title.trim() && addTreatment.mutate()} className="rounded-md bg-primary text-primary-foreground px-4 py-2">פתח טיפול</button>
            </div>
          </div>
          <div className="space-y-2">
            {treatments?.map((t) => (
              <div key={t.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex justify-between">
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs bg-muted px-2 py-0.5 rounded">{t.status}</div>
                </div>
                {t.description && <div className="text-sm text-muted-foreground mt-1">{t.description}</div>}
                {t.due_date && <div className="text-xs text-muted-foreground mt-1">יעד: {t.due_date}</div>}
              </div>
            ))}
            {treatments && !treatments.length && <div className="text-center py-8 text-muted-foreground">אין טיפולים</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex border-b border-border pb-2">
      <div className="w-32 text-sm text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}