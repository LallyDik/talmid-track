import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { reportStatusLabels, type ReportStatus } from "@/lib/hebrew";

export const Route = createFileRoute("/_authenticated/attendance/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const { data } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => (
      await supabase
        .from("attendance_reports")
        .select("*, study_sessions(name), classes(name)")
        .order("uploaded_at", { ascending: false })
        .limit(200)
    ).data ?? [],
  });

  return (
    <div>
      <PageHeader title="דוחות נוכחות" subtitle="דוחות שהועלו למערכת" actions={
        <Link to="/attendance/upload" className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm">+ העלאת דוח</Link>
      } />
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-right px-4 py-3">תאריך</th>
              <th className="text-right px-4 py-3">סדר</th>
              <th className="text-right px-4 py-3">שיעור</th>
              <th className="text-right px-4 py-3">סטטוס</th>
              <th className="text-right px-4 py-3">הועלה</th>
              <th className="text-right px-4 py-3">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">{r.report_date}</td>
                <td className="px-4 py-3">{(r.study_sessions as { name: string } | null)?.name}</td>
                <td className="px-4 py-3">{(r.classes as { name: string } | null)?.name ?? "כל הישיבה"}</td>
                <td className="px-4 py-3">{reportStatusLabels[r.processing_status as ReportStatus]}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.uploaded_at).toLocaleString("he-IL")}</td>
                <td className="px-4 py-3">
                  <Link to="/attendance/verify/$id" params={{ id: r.id }} className="text-primary text-sm">
                    פתח לאימות ←
                  </Link>
                </td>
              </tr>
            ))}
            {data && !data.length && (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">אין דוחות</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}