import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/kit";
import {
  attendanceLabels,
  formatHebrewDate,
  type AttendanceStatus,
} from "@/lib/hebrew";
import { statusColorVar, type AttendanceRecordRow } from "./shared";

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

/** Attendance statuses to show in the legend, in a sensible reading order. */
const LEGEND: AttendanceStatus[] = [
  "on_time",
  "late_b",
  "late_c",
  "absent",
  "excused",
  "unknown",
];

export function AttendanceCalendar({
  records,
}: {
  records: AttendanceRecordRow[];
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [openDay, setOpenDay] = useState<string | null>(null);

  // Group records by their ISO date.
  const byDate = useMemo(() => {
    const map = new Map<string, AttendanceRecordRow[]>();
    for (const r of records) {
      const list = map.get(r.report_date) ?? [];
      list.push(r);
      map.set(r.report_date, list);
    }
    // keep sessions in study order within a day
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          (a.study_sessions?.order_index ?? 0) -
          (b.study_sessions?.order_index ?? 0),
      );
    }
    return map;
  }, [records]);

  const firstOfMonth = new Date(cursor.year, cursor.month, 1);
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay(); // 0 = Sunday

  const cells: (string | null)[] = [];
  for (let i = 0; i < leadingBlanks; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    const iso = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push(iso);
  }

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const todayIso = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const dayRecords = openDay ? (byDate.get(openDay) ?? []) : [];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      {/* Month navigation */}
      <div className="mb-4 flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => shiftMonth(1)} aria-label="חודש הבא">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="text-base font-semibold">
          {MONTHS[cursor.month]} {cursor.year}
        </div>
        <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)} aria-label="חודש קודם">
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-[11px] font-medium text-muted-foreground">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((iso, i) => {
          if (!iso) return <div key={`b${i}`} />;
          const day = Number(iso.slice(-2));
          const recs = byDate.get(iso) ?? [];
          const isToday = iso === todayIso;
          return (
            <button
              key={iso}
              type="button"
              disabled={recs.length === 0}
              onClick={() => recs.length > 0 && setOpenDay(iso)}
              className={[
                "flex min-h-[58px] flex-col rounded-lg border p-1.5 text-start transition-colors",
                recs.length > 0
                  ? "cursor-pointer border-border hover:bg-accent/40"
                  : "cursor-default border-transparent bg-muted/20",
                isToday ? "ring-2 ring-primary/50" : "",
              ].join(" ")}
            >
              <span
                className={[
                  "text-[11px] font-medium",
                  isToday ? "text-primary" : "text-muted-foreground",
                ].join(" ")}
              >
                {day}
              </span>
              {recs.length > 0 && (
                <span className="mt-auto flex flex-wrap gap-1 pt-1">
                  {recs.map((r) => (
                    <span
                      key={r.id}
                      title={`${r.study_sessions?.name ?? ""}: ${attendanceLabels[r.attendance_status as AttendanceStatus]}`}
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          statusColorVar[r.attendance_status as AttendanceStatus],
                      }}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3">
        {LEGEND.map((s) => (
          <div key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: statusColorVar[s] }}
            />
            {attendanceLabels[s]}
          </div>
        ))}
      </div>

      {/* Day detail */}
      <Dialog open={openDay !== null} onOpenChange={(v) => !v && setOpenDay(null)}>
        <DialogContent dir="rtl" className="rounded-2xl">
          <DialogHeader className="text-right">
            <DialogTitle>{openDay ? formatHebrewDate(openDay) : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {dayRecords.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {r.study_sessions?.name ?? "—"}
                  </div>
                  {r.notes && (
                    <div className="text-xs text-muted-foreground">{r.notes}</div>
                  )}
                </div>
                <StatusBadge kind="attendance" status={r.attendance_status} long />
              </div>
            ))}
            {dayRecords.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                אין רשומות ליום זה.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
