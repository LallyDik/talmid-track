import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { DataTable, EmptyState, type Column } from "@/components/kit";
import { formatHebrewDate, type AttendanceStatus } from "@/lib/hebrew";
import type { ReportDocument } from "@/services/reportExport";
import {
  ExportToolbar,
  Field,
  FilterBar,
  SortHeader,
  useSort,
  emptyCounts,
  tally,
  totalSlots,
  attendanceRate,
  ratePercentText,
  currentMonthISO,
  monthRange,
  type ReportProps,
  type StatusCounts,
} from "./shared";

interface MonthRow {
  id: string;
  name: string;
  className: string;
  counts: StatusCounts;
  possible: number;
  rate: number | null;
}

type SortKey = "name" | "possible" | "on_time" | "late_b" | "late_c" | "absent" | "rate";

export function MonthlyAttendanceReport({ yeshivaId, yeshivaName }: ReportProps) {
  const [month, setMonth] = useState(currentMonthISO());
  const { key, dir, toggle } = useSort<SortKey>("absent", "desc");

  const { data, isLoading } = useQuery({
    queryKey: ["monthly-report", yeshivaId, month],
    enabled: !!month,
    queryFn: async () => {
      const { start, end } = monthRange(month);
      const { data: records } = await supabase
        .from("attendance_records")
        .select("student_id, attendance_status, students(full_name, classes(name))")
        .gte("report_date", start)
        .lte("report_date", end)
        .eq("is_draft", false)
        .is("deleted_at", null);

      const byStudent = new Map<string, MonthRow>();
      for (const r of records ?? []) {
        const stu = r.students as { full_name: string; classes: { name: string } | null } | null;
        let row = byStudent.get(r.student_id);
        if (!row) {
          row = {
            id: r.student_id,
            name: stu?.full_name ?? "—",
            className: stu?.classes?.name ?? "ללא שיעור",
            counts: emptyCounts(),
            possible: 0,
            rate: null,
          };
          byStudent.set(r.student_id, row);
        }
        tally(row.counts, r.attendance_status as AttendanceStatus);
      }

      const rows = Array.from(byStudent.values());
      for (const row of rows) {
        row.possible = totalSlots(row.counts);
        row.rate = attendanceRate(row.counts);
      }
      return rows;
    },
  });

  const rows = data ?? [];

  const sorted = useMemo(() => {
    const copy = [...rows];
    const mul = dir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      if (key === "name") return a.name.localeCompare(b.name, "he") * mul;
      if (key === "rate") {
        const av = a.rate ?? -1;
        const bv = b.rate ?? -1;
        return (av - bv) * mul;
      }
      if (key === "possible") return (a.possible - b.possible) * mul;
      return (a.counts[key] - b.counts[key]) * mul;
    });
    return copy;
  }, [rows, key, dir]);

  const totals = useMemo(() => {
    const c = emptyCounts();
    for (const r of rows) {
      for (const k of Object.keys(c) as AttendanceStatus[]) c[k] += r.counts[k];
    }
    return c;
  }, [rows]);

  const numCol = (
    sortKey: SortKey,
    header: string,
    read: (r: MonthRow) => number | string,
  ): Column<MonthRow> => ({
    key: sortKey,
    align: "center",
    header: (
      <SortHeader
        label={header}
        active={key === sortKey}
        dir={dir}
        align="center"
        onClick={() => toggle(sortKey)}
      />
    ),
    cell: (r) => read(r),
  });

  const columns: Column<MonthRow>[] = [
    {
      key: "name",
      header: (
        <SortHeader
          label="שם הבחור"
          active={key === "name"}
          dir={dir}
          onClick={() => toggle("name")}
        />
      ),
      cell: (r) => <span className="font-medium text-foreground">{r.name}</span>,
    },
    { key: "class", header: "שיעור", cell: (r) => r.className },
    numCol("possible", "סדרים אפשריים", (r) => r.possible),
    numCol("on_time", "בזמן", (r) => r.counts.on_time),
    numCol("late_b", "איחורי ב׳", (r) => r.counts.late_b),
    numCol("late_c", "איחורי ג׳", (r) => r.counts.late_c),
    numCol("absent", "היעדרויות", (r) => r.counts.absent),
    {
      key: "rate",
      align: "center",
      header: (
        <SortHeader
          label="אחוז נוכחות"
          active={key === "rate"}
          dir={dir}
          align="center"
          onClick={() => toggle("rate")}
        />
      ),
      cell: (r) => <span className="font-semibold">{ratePercentText(r.rate)}</span>,
    },
  ];

  function buildDocument(): ReportDocument | null {
    const dataRows = sorted.map((r) => ({
      name: r.name,
      class: r.className,
      possible: r.possible,
      on_time: r.counts.on_time,
      late_b: r.counts.late_b,
      late_c: r.counts.late_c,
      absent: r.counts.absent,
      rate: ratePercentText(r.rate),
    }));
    dataRows.push({
      name: "סה״כ",
      class: "",
      possible: totalSlots(totals),
      on_time: totals.on_time,
      late_b: totals.late_b,
      late_c: totals.late_c,
      absent: totals.absent,
      rate: ratePercentText(attendanceRate(totals)),
    });

    return {
      reportTitle: "דוח נוכחות חודשי",
      yeshivaName,
      subtitle: `חודש: ${formatHebrewDate(monthRange(month).start, { month: "long", year: "numeric" })}`,
      fileBaseName: `דוח נוכחות חודשי ${month}`,
      sections: [
        {
          columns: [
            { key: "name", header: "שם הבחור", width: 24 },
            { key: "class", header: "שיעור", width: 18 },
            { key: "possible", header: "סדרים אפשריים", width: 16, align: "center" },
            { key: "on_time", header: "בזמן", width: 10, align: "center" },
            { key: "late_b", header: "איחורי ב׳", width: 12, align: "center" },
            { key: "late_c", header: "איחורי ג׳", width: 12, align: "center" },
            { key: "absent", header: "היעדרויות", width: 12, align: "center" },
            { key: "rate", header: "אחוז נוכחות", width: 14, align: "center" },
          ],
          rows: dataRows,
        },
      ],
    };
  }

  return (
    <div className="space-y-5">
      <FilterBar>
        <Field label="חודש" htmlFor="monthly-month" className="min-w-[10rem]">
          <Input
            id="monthly-month"
            type="month"
            value={month}
            max={currentMonthISO()}
            onChange={(e) => setMonth(e.target.value)}
          />
        </Field>
        <div className="ms-auto self-end">
          <ExportToolbar buildDocument={buildDocument} disabled={isLoading || rows.length === 0} />
        </div>
      </FilterBar>

      {!isLoading && rows.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="אין נתוני נוכחות לחודש זה"
          description="לא נמצאו רשומות נוכחות מאושרות בטווח החודש שנבחר."
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={sorted}
            rowKey={(r) => r.id}
            pageSize={15}
            loading={isLoading}
          />
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border border-border/70 bg-muted/30 px-5 py-3 text-sm">
              <span className="font-semibold text-foreground">סיכום ({rows.length} בחורים):</span>
              <span>סדרים: {totalSlots(totals)}</span>
              <span>בזמן: {totals.on_time}</span>
              <span>איחורים: {totals.late_b + totals.late_c}</span>
              <span>היעדרויות: {totals.absent}</span>
              <span className="font-semibold text-foreground">
                נוכחות כללית: {ratePercentText(attendanceRate(totals))}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
