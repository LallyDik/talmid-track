import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Clock, AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { EmptyState, DataTable, type Column } from "@/components/kit";
import { formatHebrewDate } from "@/lib/hebrew";
import type { ReportDocument } from "@/services/reportExport";
import {
  ExportToolbar,
  Field,
  FilterBar,
  isoOf,
  daysAgoISO,
  todayISO,
  type ReportProps,
} from "./shared";

interface LateHit {
  date: string;
  level: "late_b" | "late_c";
}

interface LateRow {
  id: string;
  name: string;
  className: string;
  total: number;
  b: number;
  c: number;
  hits: LateHit[];
}

const rangeSchema = z
  .object({ from: z.string().min(1), to: z.string().min(1) })
  .refine((v) => v.from <= v.to, { message: "תאריך ההתחלה חייב להיות לפני תאריך הסיום" });

function shortDate(iso: string): string {
  return formatHebrewDate(iso, { day: "numeric", month: "short" });
}

export function LatenessReport({ yeshivaId, yeshivaName }: ReportProps) {
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [thresholdRaw, setThresholdRaw] = useState("3");

  const rangeParsed = rangeSchema.safeParse({ from, to });
  const thresholdNum = Number(thresholdRaw);
  const thresholdValid = Number.isInteger(thresholdNum) && thresholdNum >= 1 && thresholdNum <= 999;
  const errorMsg = !rangeParsed.success
    ? "תאריך ההתחלה חייב להיות לפני תאריך הסיום"
    : !thresholdValid
      ? "סף האיחורים חייב להיות מספר שלם בין 1 ל-999"
      : null;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["lateness-report", yeshivaId, from, to],
    enabled: rangeParsed.success,
    queryFn: async () => {
      const { data: records } = await supabase
        .from("attendance_records")
        .select("student_id, attendance_status, report_date, students(full_name, classes(name))")
        .in("attendance_status", ["late_b", "late_c"])
        .gte("report_date", from)
        .lte("report_date", to)
        .eq("is_draft", false)
        .is("deleted_at", null)
        .order("report_date");

      const map = new Map<string, LateRow>();
      for (const r of records ?? []) {
        const stu = r.students as { full_name: string; classes: { name: string } | null } | null;
        let row = map.get(r.student_id);
        if (!row) {
          row = {
            id: r.student_id,
            name: stu?.full_name ?? "—",
            className: stu?.classes?.name ?? "ללא שיעור",
            total: 0,
            b: 0,
            c: 0,
            hits: [],
          };
          map.set(r.student_id, row);
        }
        const level = r.attendance_status as "late_b" | "late_c";
        row.total += 1;
        if (level === "late_b") row.b += 1;
        else row.c += 1;
        row.hits.push({ date: r.report_date, level });
      }
      return Array.from(map.values());
    },
  });

  const filtered = useMemo(() => {
    const rows = (data ?? []).filter((r) => r.total >= (thresholdValid ? thresholdNum : 1));
    rows.sort((a, b) => b.total - a.total || b.c - a.c || a.name.localeCompare(b.name, "he"));
    for (const r of rows) r.hits.sort((x, y) => x.date.localeCompare(y.date));
    return rows;
  }, [data, thresholdNum, thresholdValid]);

  const columns: Column<LateRow>[] = [
    {
      key: "name",
      header: "שם הבחור",
      cell: (r) => <span className="font-medium text-foreground">{r.name}</span>,
    },
    { key: "class", header: "שיעור", cell: (r) => r.className },
    {
      key: "total",
      header: "סה״כ איחורים",
      align: "center",
      cell: (r) => <span className="font-bold text-[var(--status-late-c)]">{r.total}</span>,
    },
    { key: "b", header: "ב׳", align: "center", cell: (r) => r.b },
    { key: "c", header: "ג׳", align: "center", cell: (r) => r.c },
    {
      key: "dates",
      header: "תאריכי האיחורים",
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.hits.map((h, i) => (
            <span
              key={i}
              className={
                h.level === "late_c"
                  ? "rounded-md bg-[color-mix(in_oklch,var(--status-late-c)_18%,transparent)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--status-late-c)]"
                  : "rounded-md bg-[color-mix(in_oklch,var(--status-late-b)_22%,transparent)] px-1.5 py-0.5 text-[11px] font-medium text-[color-mix(in_oklch,var(--status-late-b)_60%,black)]"
              }
            >
              {shortDate(h.date)}
            </span>
          ))}
        </div>
      ),
    },
  ];

  function buildDocument(): ReportDocument | null {
    return {
      reportTitle: "דוח איחורים",
      yeshivaName,
      subtitle: `טווח: ${formatHebrewDate(from)} – ${formatHebrewDate(to)} · סף: ${thresholdNum}+ איחורים`,
      fileBaseName: `דוח איחורים ${from}`,
      sections: [
        {
          columns: [
            { key: "name", header: "שם הבחור", width: 24 },
            { key: "class", header: "שיעור", width: 18 },
            { key: "total", header: "סה״כ איחורים", width: 14, align: "center" },
            { key: "b", header: "איחורי ב׳", width: 10, align: "center" },
            { key: "c", header: "איחורי ג׳", width: 10, align: "center" },
            { key: "dates", header: "תאריכי האיחורים", width: 44 },
          ],
          rows: filtered.map((r) => ({
            name: r.name,
            class: r.className,
            total: r.total,
            b: r.b,
            c: r.c,
            dates: r.hits.map((h) => `${isoOf(new Date(h.date))} (${h.level === "late_c" ? "ג׳" : "ב׳"})`).join(", "),
          })),
        },
      ],
    };
  }

  return (
    <div className="space-y-5">
      <FilterBar>
        <Field label="מתאריך" htmlFor="late-from" className="min-w-[9rem]">
          <Input id="late-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="עד תאריך" htmlFor="late-to" className="min-w-[9rem]">
          <Input id="late-to" type="date" value={to} max={todayISO()} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="סף איחורים (ומעלה)" htmlFor="late-threshold" className="min-w-[9rem]">
          <Input
            id="late-threshold"
            type="number"
            min={1}
            max={999}
            value={thresholdRaw}
            onChange={(e) => setThresholdRaw(e.target.value)}
          />
        </Field>
        <div className="ms-auto self-end">
          <ExportToolbar
            buildDocument={buildDocument}
            disabled={!!errorMsg || isLoading || filtered.length === 0}
          />
        </div>
      </FilterBar>

      {errorMsg && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {errorMsg}
        </p>
      )}

      {!isLoading && filtered.length === 0 && !errorMsg ? (
        <EmptyState
          icon={Clock}
          title="לא נמצאו בחורים מעל הסף"
          description={`אף בחור לא הגיע ל-${thresholdNum} איחורים בטווח שנבחר. נסו להוריד את הסף או להרחיב את הטווח.`}
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.id}
          pageSize={15}
          loading={isLoading || isFetching}
        />
      )}
    </div>
  );
}
