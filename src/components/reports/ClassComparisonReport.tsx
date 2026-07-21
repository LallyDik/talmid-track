import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { GraduationCap, Users, TrendingUp, Clock, XCircle, AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard, EmptyState, SectionCard, DataTable, type Column } from "@/components/kit";
import { formatHebrewDate, type AttendanceStatus } from "@/lib/hebrew";
import type { ReportDocument } from "@/services/reportExport";
import {
  ExportToolbar,
  Field,
  FilterBar,
  SortHeader,
  useSort,
  StatusDistribution,
  LabeledBars,
  emptyCounts,
  tally,
  totalSlots,
  attended,
  attendanceRate,
  ratePercentText,
  daysAgoISO,
  todayISO,
  type ReportProps,
  type StatusCounts,
} from "./shared";

interface ClassStudentRow {
  id: string;
  name: string;
  counts: StatusCounts;
  possible: number;
  rate: number | null;
}

type SortKey = "name" | "possible" | "late" | "absent" | "rate";

const rangeSchema = z
  .object({ from: z.string().min(1, "יש לבחור תאריך התחלה"), to: z.string().min(1, "יש לבחור תאריך סיום") })
  .refine((v) => v.from <= v.to, { message: "תאריך ההתחלה חייב להיות לפני תאריך הסיום", path: ["to"] });

export function ClassComparisonReport({ yeshivaId, yeshivaName }: ReportProps) {
  const [classId, setClassId] = useState<string>("");
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const { key, dir, toggle } = useSort<SortKey>("rate", "asc");

  const parsed = rangeSchema.safeParse({ from, to });
  const rangeError = parsed.success ? null : parsed.error.issues[0]?.message ?? null;

  const { data: classes } = useQuery({
    queryKey: ["report-classes", yeshivaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, name")
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["class-report", yeshivaId, classId, from, to],
    enabled: !!classId && parsed.success,
    queryFn: async () => {
      const { data: students } = await supabase
        .from("students")
        .select("id, full_name")
        .eq("class_id", classId)
        .eq("active", true)
        .order("full_name");
      const list = students ?? [];
      const ids = list.map((s) => s.id);

      const rowsMap = new Map<string, ClassStudentRow>();
      for (const s of list) {
        rowsMap.set(s.id, {
          id: s.id,
          name: s.full_name,
          counts: emptyCounts(),
          possible: 0,
          rate: null,
        });
      }

      if (ids.length > 0) {
        const { data: records } = await supabase
          .from("attendance_records")
          .select("student_id, attendance_status")
          .in("student_id", ids)
          .gte("report_date", from)
          .lte("report_date", to)
          .eq("is_draft", false)
          .is("deleted_at", null);
        for (const r of records ?? []) {
          const row = rowsMap.get(r.student_id);
          if (row) tally(row.counts, r.attendance_status as AttendanceStatus);
        }
      }

      const rows = Array.from(rowsMap.values());
      for (const row of rows) {
        row.possible = totalSlots(row.counts);
        row.rate = attendanceRate(row.counts);
      }
      return rows;
    },
  });

  const rows = data ?? [];

  const classTotals = useMemo(() => {
    const c = emptyCounts();
    for (const r of rows) for (const k of Object.keys(c) as AttendanceStatus[]) c[k] += r.counts[k];
    return c;
  }, [rows]);

  const classRate = attendanceRate(classTotals);

  const sorted = useMemo(() => {
    const copy = [...rows];
    const mul = dir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      if (key === "name") return a.name.localeCompare(b.name, "he") * mul;
      if (key === "rate") return ((a.rate ?? -1) - (b.rate ?? -1)) * mul;
      if (key === "possible") return (a.possible - b.possible) * mul;
      if (key === "late")
        return (a.counts.late_b + a.counts.late_c - (b.counts.late_b + b.counts.late_c)) * mul;
      return (a.counts.absent - b.counts.absent) * mul;
    });
    return copy;
  }, [rows, key, dir]);

  const chartData = useMemo(
    () =>
      [...rows]
        .filter((r) => r.possible > 0)
        .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0))
        .map((r) => ({
          label: r.name.split(" ")[0] ?? r.name,
          value: r.rate ?? 0,
          fill:
            (r.rate ?? 0) >= 90
              ? "var(--status-on-time)"
              : (r.rate ?? 0) >= 75
                ? "var(--status-late-b)"
                : "var(--status-absent)",
        })),
    [rows],
  );

  const className = classes?.find((c) => c.id === classId)?.name ?? "";
  const withData = rows.filter((r) => r.possible > 0).length;

  const columns: Column<ClassStudentRow>[] = [
    {
      key: "name",
      header: (
        <SortHeader label="שם הבחור" active={key === "name"} dir={dir} onClick={() => toggle("name")} />
      ),
      cell: (r) => <span className="font-medium text-foreground">{r.name}</span>,
    },
    {
      key: "possible",
      align: "center",
      header: (
        <SortHeader
          label="סדרים"
          active={key === "possible"}
          dir={dir}
          align="center"
          onClick={() => toggle("possible")}
        />
      ),
      cell: (r) => r.possible,
    },
    {
      key: "late",
      align: "center",
      header: (
        <SortHeader
          label="איחורים"
          active={key === "late"}
          dir={dir}
          align="center"
          onClick={() => toggle("late")}
        />
      ),
      cell: (r) => r.counts.late_b + r.counts.late_c,
    },
    {
      key: "absent",
      align: "center",
      header: (
        <SortHeader
          label="היעדרויות"
          active={key === "absent"}
          dir={dir}
          align="center"
          onClick={() => toggle("absent")}
        />
      ),
      cell: (r) => r.counts.absent,
    },
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
      cell: (r) => (
        <span className="font-semibold">
          {ratePercentText(r.rate)}
          {r.rate !== null && classRate !== null && (
            <span
              className={
                r.rate >= classRate ? "ms-1 text-xs text-[var(--status-on-time)]" : "ms-1 text-xs text-[var(--status-absent)]"
              }
            >
              {r.rate >= classRate ? "▲" : "▼"}
            </span>
          )}
        </span>
      ),
    },
  ];

  function buildDocument(): ReportDocument | null {
    const dataRows = sorted.map((r) => ({
      name: r.name,
      possible: r.possible,
      on_time: r.counts.on_time,
      late: r.counts.late_b + r.counts.late_c,
      absent: r.counts.absent,
      rate: ratePercentText(r.rate),
    }));
    dataRows.push({
      name: "ממוצע כיתתי",
      possible: totalSlots(classTotals),
      on_time: classTotals.on_time,
      late: classTotals.late_b + classTotals.late_c,
      absent: classTotals.absent,
      rate: ratePercentText(classRate),
    });

    return {
      reportTitle: "דוח לפי שיעור",
      yeshivaName,
      subtitle: `שיעור: ${className} · טווח: ${formatHebrewDate(from)} – ${formatHebrewDate(to)}`,
      fileBaseName: `דוח שיעור ${className} ${from}`,
      sections: [
        {
          title: "השוואת בחורים",
          columns: [
            { key: "name", header: "שם הבחור", width: 24 },
            { key: "possible", header: "סדרים", width: 12, align: "center" },
            { key: "on_time", header: "בזמן", width: 10, align: "center" },
            { key: "late", header: "איחורים", width: 12, align: "center" },
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
        <Field label="שיעור" className="min-w-[12rem]">
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger>
              <SelectValue placeholder="בחר שיעור" />
            </SelectTrigger>
            <SelectContent>
              {classes?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="מתאריך" htmlFor="class-from" className="min-w-[9rem]">
          <Input id="class-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="עד תאריך" htmlFor="class-to" className="min-w-[9rem]">
          <Input id="class-to" type="date" value={to} max={todayISO()} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <div className="ms-auto self-end">
          <ExportToolbar
            buildDocument={buildDocument}
            disabled={!classId || !parsed.success || isLoading || rows.length === 0}
          />
        </div>
      </FilterBar>

      {rangeError && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {rangeError}
        </p>
      )}

      {!classId ? (
        <EmptyState
          icon={GraduationCap}
          title="בחרו שיעור"
          description="בחרו שיעור וטווח תאריכים כדי להשוות בין הבחורים בשיעור."
        />
      ) : !isLoading && rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="אין בחורים בשיעור זה"
          description="לא נמצאו בחורים פעילים המשויכים לשיעור שנבחר."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="בחורים בשיעור" value={rows.length} icon={Users} tone="teal" />
            <StatCard
              label="ממוצע נוכחות"
              value={ratePercentText(classRate)}
              icon={TrendingUp}
              tone="green"
              hint={`${withData} עם נתונים`}
            />
            <StatCard
              label="סה״כ איחורים"
              value={classTotals.late_b + classTotals.late_c}
              icon={Clock}
              tone="amber"
            />
            <StatCard label="סה״כ היעדרויות" value={classTotals.absent} icon={XCircle} tone="red" />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard title="התפלגות נוכחות בשיעור" icon={GraduationCap}>
              <StatusDistribution counts={classTotals} />
            </SectionCard>
            <SectionCard title="אחוז נוכחות לכל בחור" icon={TrendingUp}>
              <LabeledBars data={chartData} unit="%" />
            </SectionCard>
          </div>

          <DataTable
            columns={columns}
            data={sorted}
            rowKey={(r) => r.id}
            pageSize={15}
            loading={isLoading || isFetching}
          />
        </>
      )}
    </div>
  );
}
