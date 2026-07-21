import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { UserX, AlertTriangle } from "lucide-react";

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

interface AbsenceRow {
  id: string;
  name: string;
  className: string;
  total: number;
  dates: string[];
}

const rangeSchema = z
  .object({ from: z.string().min(1), to: z.string().min(1) })
  .refine((v) => v.from <= v.to, { message: "תאריך ההתחלה חייב להיות לפני תאריך הסיום" });

function shortDate(iso: string): string {
  return formatHebrewDate(iso, { day: "numeric", month: "numeric" });
}

/**
 * דוח היעדרויות — כל שורות הנוכחות בסטטוס "חסר" בטווח שנבחר, מקובצות לפי בחור,
 * מעל סף מינימלי. כמו כל שאר דוחות המודול, נספרות אך ורק רשומות מאושרות
 * (is_draft = false) ולא-מחוקות (deleted_at IS NULL).
 */
export function AbsenceReport({ yeshivaId, yeshivaName }: ReportProps) {
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [thresholdRaw, setThresholdRaw] = useState("1");

  const rangeParsed = rangeSchema.safeParse({ from, to });
  const thresholdNum = Number(thresholdRaw);
  const thresholdValid = Number.isInteger(thresholdNum) && thresholdNum >= 1 && thresholdNum <= 999;
  const errorMsg = !rangeParsed.success
    ? "תאריך ההתחלה חייב להיות לפני תאריך הסיום"
    : !thresholdValid
      ? "סף ההיעדרויות חייב להיות מספר שלם בין 1 ל-999"
      : null;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["absence-report", yeshivaId, from, to],
    enabled: rangeParsed.success,
    queryFn: async () => {
      const { data: records } = await supabase
        .from("attendance_records")
        .select("student_id, report_date, students(full_name, classes(name))")
        .eq("attendance_status", "absent")
        .gte("report_date", from)
        .lte("report_date", to)
        .eq("is_draft", false)
        .is("deleted_at", null)
        .order("report_date");

      const map = new Map<string, AbsenceRow>();
      for (const r of records ?? []) {
        const stu = r.students as { full_name: string; classes: { name: string } | null } | null;
        let row = map.get(r.student_id);
        if (!row) {
          row = {
            id: r.student_id,
            name: stu?.full_name ?? "—",
            className: stu?.classes?.name ?? "ללא שיעור",
            total: 0,
            dates: [],
          };
          map.set(r.student_id, row);
        }
        row.total += 1;
        row.dates.push(r.report_date);
      }
      return Array.from(map.values());
    },
  });

  const filtered = useMemo(() => {
    const rows = (data ?? []).filter((r) => r.total >= (thresholdValid ? thresholdNum : 1));
    rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "he"));
    for (const r of rows) r.dates.sort((x, y) => x.localeCompare(y));
    return rows;
  }, [data, thresholdNum, thresholdValid]);

  const columns: Column<AbsenceRow>[] = [
    {
      key: "name",
      header: "שם הבחור",
      cell: (r) => <span className="font-medium text-foreground">{r.name}</span>,
    },
    { key: "class", header: "שיעור", cell: (r) => r.className },
    {
      key: "total",
      header: "סה״כ היעדרויות",
      align: "center",
      cell: (r) => <span className="font-bold text-[var(--status-absent)]">{r.total}</span>,
    },
    {
      key: "dates",
      header: "תאריכי ההיעדרויות",
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.dates.map((d, i) => (
            <span
              key={i}
              className="rounded-md bg-[color-mix(in_oklch,var(--status-absent)_16%,transparent)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--status-absent)]"
            >
              {shortDate(d)}
            </span>
          ))}
        </div>
      ),
    },
  ];

  function buildDocument(): ReportDocument | null {
    return {
      reportTitle: "דוח היעדרויות",
      yeshivaName,
      subtitle: `טווח: ${formatHebrewDate(from)} – ${formatHebrewDate(to)} · סף: ${thresholdNum}+ היעדרויות`,
      fileBaseName: `דוח היעדרויות ${from}`,
      sections: [
        {
          columns: [
            { key: "name", header: "שם הבחור", width: 24 },
            { key: "class", header: "שיעור", width: 18 },
            { key: "total", header: "סה״כ היעדרויות", width: 16, align: "center" },
            { key: "dates", header: "תאריכי ההיעדרויות", width: 44 },
          ],
          rows: filtered.map((r) => ({
            name: r.name,
            class: r.className,
            total: r.total,
            dates: r.dates.map((d) => isoOf(new Date(d))).join(", "),
          })),
        },
      ],
    };
  }

  return (
    <div className="space-y-5">
      <FilterBar>
        <Field label="מתאריך" htmlFor="absence-from" className="min-w-[9rem]">
          <Input id="absence-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="עד תאריך" htmlFor="absence-to" className="min-w-[9rem]">
          <Input id="absence-to" type="date" value={to} max={todayISO()} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="סף היעדרויות (ומעלה)" htmlFor="absence-threshold" className="min-w-[9rem]">
          <Input
            id="absence-threshold"
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
          icon={UserX}
          title="לא נמצאו היעדרויות מעל הסף"
          description={`אף בחור לא הגיע ל-${thresholdNum} היעדרויות בטווח שנבחר. נסו להוריד את הסף או להרחיב את הטווח.`}
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
