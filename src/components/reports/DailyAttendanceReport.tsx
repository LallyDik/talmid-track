import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Users, CheckCircle2, Clock, XCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { HebrewDatePicker } from "@/components/HebrewDatePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard, EmptyState, SectionCard, TableSkeleton } from "@/components/kit";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { attendanceShort, formatHebrewDate, type AttendanceStatus } from "@/lib/hebrew";
import type { ReportDocument } from "@/services/reportExport";
import {
  ExportToolbar,
  Field,
  FilterBar,
  StatusDistribution,
  emptyCounts,
  tally,
  todayISO,
  attendanceRate,
  ratePercentText,
  type ReportProps,
  type StatusCounts,
} from "./shared";

interface StudentRow {
  id: string;
  full_name: string;
  class_id: string | null;
  className: string;
  status: AttendanceStatus | "none";
  note: string | null;
}

interface ClassGroup {
  key: string;
  className: string;
  students: StudentRow[];
}

const CLASSLESS = "ללא שיעור";

export function DailyAttendanceReport({ yeshivaId, yeshivaName }: ReportProps) {
  const [date, setDate] = useState(todayISO());
  const [sessionId, setSessionId] = useState<string>("");

  const { data: sessions } = useQuery({
    queryKey: ["report-sessions", yeshivaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("study_sessions")
        .select("id, name, order_index")
        .eq("active", true)
        .order("order_index");
      return data ?? [];
    },
  });

  const effectiveSession = sessionId || sessions?.[0]?.id || "";

  const { data, isLoading } = useQuery({
    queryKey: ["daily-report", yeshivaId, date, effectiveSession],
    enabled: !!effectiveSession && !!date,
    queryFn: async () => {
      const [studentsRes, recordsRes] = await Promise.all([
        supabase
          .from("students")
          .select("id, full_name, class_id, classes(name)")
          .eq("active", true)
          .order("full_name"),
        supabase
          .from("attendance_records")
          .select("student_id, attendance_status, notes")
          .eq("report_date", date)
          .eq("study_session_id", effectiveSession)
          .eq("is_draft", false)
          .is("deleted_at", null),
      ]);

      const byStudent = new Map<string, { status: AttendanceStatus; notes: string | null }>();
      for (const r of recordsRes.data ?? []) {
        byStudent.set(r.student_id, {
          status: r.attendance_status as AttendanceStatus,
          notes: r.notes,
        });
      }

      const rows: StudentRow[] = (studentsRes.data ?? []).map((s) => {
        const rec = byStudent.get(s.id);
        return {
          id: s.id,
          full_name: s.full_name,
          class_id: s.class_id,
          className: (s.classes as { name: string } | null)?.name ?? CLASSLESS,
          status: rec ? rec.status : "none",
          note: rec?.notes ?? null,
        };
      });
      return rows;
    },
  });

  const rows = data ?? [];

  const groups = useMemo<ClassGroup[]>(() => {
    const map = new Map<string, ClassGroup>();
    for (const r of rows) {
      const key = r.class_id ?? "none";
      if (!map.has(key)) map.set(key, { key, className: r.className, students: [] });
      map.get(key)!.students.push(r);
    }
    return Array.from(map.values()).sort((a, b) => a.className.localeCompare(b.className, "he"));
  }, [rows]);

  const counts = useMemo<StatusCounts>(() => {
    const c = emptyCounts();
    for (const r of rows) if (r.status !== "none") tally(c, r.status);
    return c;
  }, [rows]);

  const recorded = rows.filter((r) => r.status !== "none").length;
  const sessionName = sessions?.find((s) => s.id === effectiveSession)?.name ?? "";
  const rate = attendanceRate(counts);

  function buildDocument(): ReportDocument | null {
    const sections = groups.map((g) => ({
      title: g.className,
      columns: [
        { key: "name", header: "שם הבחור", width: 26 },
        { key: "status", header: "סטטוס", width: 16 },
        { key: "note", header: "הערה", width: 30 },
      ],
      rows: g.students.map((s) => ({
        name: s.full_name,
        status: s.status === "none" ? "אין נתונים" : attendanceShort[s.status],
        note: s.note ?? "",
      })),
    }));

    const summary = {
      title: "סיכום",
      columns: [
        { key: "metric", header: "מדד", width: 24 },
        { key: "value", header: "ערך", width: 14 },
      ],
      rows: [
        { metric: "סה״כ בחורים", value: rows.length },
        { metric: "נרשמה נוכחות", value: recorded },
        { metric: "הגיעו בזמן", value: counts.on_time },
        { metric: "איחורי ב׳", value: counts.late_b },
        { metric: "איחורי ג׳", value: counts.late_c },
        { metric: "היעדרויות", value: counts.absent },
        { metric: "מוצדק", value: counts.excused },
        { metric: "אחוז נוכחות", value: ratePercentText(rate) },
      ],
    };

    return {
      reportTitle: "דוח נוכחות יומי",
      yeshivaName,
      subtitle: `סדר: ${sessionName} · תאריך: ${formatHebrewDate(date)}`,
      fileBaseName: `דוח נוכחות יומי ${date}`,
      sections: [summary, ...sections],
    };
  }

  return (
    <div className="space-y-5">
      <FilterBar>
        <Field label="תאריך" htmlFor="daily-date" className="min-w-[9rem]">
          <HebrewDatePicker
            id="daily-date"
            value={date}
            max={todayISO()}
            onChange={setDate}
          />
        </Field>
        <Field label="סדר" className="min-w-[12rem]">
          <Select value={effectiveSession} onValueChange={setSessionId}>
            <SelectTrigger>
              <SelectValue placeholder="בחר סדר" />
            </SelectTrigger>
            <SelectContent>
              {sessions?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="ms-auto self-end">
          <ExportToolbar buildDocument={buildDocument} disabled={isLoading || rows.length === 0} />
        </div>
      </FilterBar>

      {isLoading ? (
        <TableSkeleton rows={8} columns={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="אין בחורים פעילים"
          description="כדי להפיק דוח נוכחות יש להוסיף בחורים למערכת."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="סה״כ בחורים" value={rows.length} icon={Users} tone="teal" />
            <StatCard label="הגיעו בזמן" value={counts.on_time} icon={CheckCircle2} tone="green" />
            <StatCard
              label="איחורים"
              value={counts.late_b + counts.late_c}
              icon={Clock}
              tone="amber"
            />
            <StatCard label="היעדרויות" value={counts.absent} icon={XCircle} tone="red" />
            <StatCard
              label="אחוז נוכחות"
              value={ratePercentText(rate)}
              icon={CalendarClock}
              tone="blue"
              hint={`${recorded} מתוך ${rows.length} נרשמו`}
            />
          </div>

          <SectionCard title="התפלגות נוכחות" icon={CalendarClock}>
            <StatusDistribution counts={counts} />
          </SectionCard>

          {groups.map((g) => (
            <SectionCard
              key={g.key}
              title={g.className}
              description={`${g.students.length} בחורים`}
              noPadding
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-2.5 text-start text-xs font-semibold text-muted-foreground">
                        שם הבחור
                      </th>
                      <th className="px-4 py-2.5 text-start text-xs font-semibold text-muted-foreground">
                        סטטוס
                      </th>
                      <th className="px-4 py-2.5 text-start text-xs font-semibold text-muted-foreground">
                        הערה
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.students.map((s, i) => (
                      <tr
                        key={s.id}
                        className={i % 2 === 1 ? "bg-muted/25" : undefined}
                      >
                        <td className="px-4 py-2.5 font-medium text-foreground">{s.full_name}</td>
                        <td className="px-4 py-2.5">
                          {s.status === "none" ? (
                            <span className="text-xs text-muted-foreground">אין נתונים</span>
                          ) : (
                            <StatusBadge kind="attendance" status={s.status} long />
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{s.note ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ))}
        </>
      )}
    </div>
  );
}
