import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function Dashboard() {
  const today = new Date().toISOString().slice(0, 10);

  const { data } = useQuery({
    queryKey: ["dashboard", today],
    queryFn: async () => {
      const [studentsRes, todayRecords, pendingReports] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("attendance_records").select("attendance_status").eq("report_date", today),
        supabase
          .from("attendance_reports")
          .select("id", { count: "exact", head: true })
          .in("processing_status", ["pending", "needs_review", "processing"]),
      ]);
      const recs = todayRecords.data ?? [];
      return {
        activeStudents: studentsRes.count ?? 0,
        presentToday: recs.filter((r) => r.attendance_status === "on_time").length,
        lateToday: recs.filter((r) => r.attendance_status === "late_b" || r.attendance_status === "late_c").length,
        absentToday: recs.filter((r) => r.attendance_status === "absent").length,
        pendingReports: pendingReports.count ?? 0,
      };
    },
  });

  return (
    <div>
      <PageHeader title="לוח בקרה" subtitle={`נתונים ליום ${new Date().toLocaleDateString("he-IL")}`} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="בחורים פעילים" value={data?.activeStudents ?? "—"} />
        <StatCard label="נוכחים היום" value={data?.presentToday ?? 0} />
        <StatCard label="מאחרים היום" value={data?.lateToday ?? 0} />
        <StatCard label="נעדרים היום" value={data?.absentToday ?? 0} />
        <StatCard label="דוחות ממתינים לאישור" value={data?.pendingReports ?? 0} />
      </div>
      <div className="mt-8 bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-2">התחלה מהירה</h2>
        <ul className="list-disc pr-5 text-sm text-muted-foreground space-y-1">
          <li>הוסף בחורים במסך "בחורים"</li>
          <li>העלה דוח נוכחות סרוק במסך "העלאת דוח"</li>
          <li>אשר את הזיהוי במסך "דוחות נוכחות"</li>
          <li>עקוב אחר בחור בכרטיס האישי שלו</li>
        </ul>
      </div>
    </div>
  );
}