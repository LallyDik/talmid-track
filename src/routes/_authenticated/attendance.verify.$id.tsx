import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { attendanceLabels, attendanceClass, attendanceShort, type AttendanceStatus } from "@/lib/hebrew";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/attendance/verify/$id")({
  component: VerifyPage,
});

const STATUSES: AttendanceStatus[] = ["on_time", "late_b", "late_c", "absent", "excused", "unknown"];

function VerifyPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: report } = useQuery({
    queryKey: ["report", id],
    queryFn: async () => (await supabase.from("attendance_reports").select("*, study_sessions(name), classes(name)").eq("id", id).single()).data,
  });

  const { data: records } = useQuery({
    queryKey: ["report-records", id],
    queryFn: async () => (await supabase.from("attendance_records").select("*, students(full_name, classes(name))").eq("attendance_report_id", id)).data ?? [],
  });

  const [edits, setEdits] = useState<Record<string, AttendanceStatus>>({});
  const [fileSignedUrl, setFileSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (report?.file_url) {
      supabase.storage.from("attendance-reports").createSignedUrl(report.file_url, 3600).then(({ data }) => {
        setFileSignedUrl(data?.signedUrl ?? null);
      });
    }
  }, [report?.file_url]);

  const merged = useMemo(() => {
    return (records ?? []).map((r) => ({
      ...r,
      current: (edits[r.id] ?? r.attendance_status) as AttendanceStatus,
    }));
  }, [records, edits]);

  const approve = useMutation({
    mutationFn: async () => {
      const updates = merged.map((r) => ({
        id: r.id,
        attendance_status: r.current,
        manually_verified: true,
        verified_by: user?.id,
      }));
      // Batch update sequentially — small dataset
      for (const u of updates) {
        await supabase
          .from("attendance_records")
          .update({
            attendance_status: u.attendance_status,
            manually_verified: true,
            verified_by: u.verified_by,
          })
          .eq("id", u.id);
      }
      await supabase.from("attendance_reports").update({ processing_status: "approved" }).eq("id", id);
    },
    onSuccess: () => {
      qc.invalidateQueries();
      navigate({ to: "/attendance/reports" });
    },
  });

  return (
    <div>
      <PageHeader
        title="אימות דוח נוכחות"
        subtitle={report ? `${report.report_date} · ${(report.study_sessions as { name: string } | null)?.name} · ${(report.classes as { name: string } | null)?.name ?? "כל הישיבה"}` : ""}
        actions={
          <>
            <button
              onClick={() => {
                const all: Record<string, AttendanceStatus> = {};
                merged.forEach((r) => (all[r.id] = r.current));
                setEdits(all);
                approve.mutate();
              }}
              disabled={approve.isPending}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
            >
              {approve.isPending ? "שומר..." : "אשר ועדכן נוכחות"}
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="bg-muted px-4 py-2 text-sm font-medium">הקובץ הסרוק</div>
          <div className="p-3 max-h-[80vh] overflow-auto">
            {fileSignedUrl ? (
              report?.original_file_name?.match(/\.(pdf)$/i) ? (
                <iframe src={fileSignedUrl} className="w-full h-[75vh]" />
              ) : (
                <img src={fileSignedUrl} alt="דוח" className="w-full h-auto" />
              )
            ) : (
              <div className="text-center py-16 text-muted-foreground text-sm">
                {report?.file_url ? "טוען..." : "לא הועלה קובץ"}
              </div>
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="bg-muted px-4 py-2 text-sm font-medium flex justify-between">
            <span>סימוני נוכחות ({merged.length} בחורים)</span>
          </div>
          <div className="max-h-[80vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-right px-2 py-2">שם</th>
                  {STATUSES.map((s) => (
                    <th key={s} className="text-center px-1 py-2 w-16">
                      <span className={`inline-block px-2 py-0.5 rounded ${attendanceClass[s]}`}>{attendanceShort[s]}</span>
                    </th>
                  ))}
                  <th className="text-center px-2 py-2 w-16">ודאות</th>
                </tr>
              </thead>
              <tbody>
                {merged.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-2 py-2 font-medium">{(r.students as { full_name: string } | null)?.full_name}</td>
                    {STATUSES.map((s) => (
                      <td key={s} className="text-center">
                        <input
                          type="radio"
                          name={`row-${r.id}`}
                          checked={r.current === s}
                          onChange={() => setEdits({ ...edits, [r.id]: s })}
                          className="accent-primary"
                        />
                      </td>
                    ))}
                    <td className="text-center text-muted-foreground">
                      {r.detection_confidence ? `${Math.round(r.detection_confidence * 100)}%` : "—"}
                    </td>
                  </tr>
                ))}
                {!merged.length && (
                  <tr><td colSpan={STATUSES.length + 2} className="text-center py-8 text-muted-foreground">אין רשומות</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2 text-xs">
        <span className="text-muted-foreground">מקרא:</span>
        {STATUSES.map((s) => (
          <span key={s} className={`px-2 py-0.5 rounded ${attendanceClass[s]}`}>{attendanceLabels[s]}</span>
        ))}
      </div>
    </div>
  );
}