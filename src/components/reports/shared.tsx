/**
 * Shared building blocks for the reports module ("ניהול הישיבה").
 *
 * - Attendance aggregation helpers (all attendance queries in this module
 *   MUST filter is_draft = false AND deleted_at IS NULL).
 * - ExportToolbar: the three export buttons wired to a document builder.
 * - FilterBar / Field: styled Hebrew filter controls.
 * - StatusDistribution: a small recharts breakdown chart.
 */

import { useState, type ReactNode } from "react";
import { FileSpreadsheet, FileText, Printer, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from "recharts";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { attendanceLabels, attendanceShort, type AttendanceStatus } from "@/lib/hebrew";
import {
  exportToExcel,
  exportToPDF,
  printReport,
  hasAnyRows,
  type ReportDocument,
} from "@/services/reportExport";

/* ------------------------------------------------------------------ *
 * Attendance aggregation
 * ------------------------------------------------------------------ */

export const ATTENDANCE_ORDER: AttendanceStatus[] = [
  "on_time",
  "late_b",
  "late_c",
  "absent",
  "excused",
  "unknown",
];

/** Hex-ish tokens (CSS vars) used for the status charts. */
export const STATUS_COLOR: Record<AttendanceStatus, string> = {
  on_time: "var(--status-on-time)",
  late_b: "var(--status-late-b)",
  late_c: "var(--status-late-c)",
  absent: "var(--status-absent)",
  excused: "var(--status-excused)",
  unknown: "var(--status-unknown)",
};

/** Props every report component receives from the reports hub. */
export interface ReportProps {
  yeshivaId: string;
  yeshivaName: string;
}

export type StatusCounts = Record<AttendanceStatus, number>;

export function emptyCounts(): StatusCounts {
  return { on_time: 0, late_b: 0, late_c: 0, absent: 0, excused: 0, unknown: 0 };
}

export function tally(counts: StatusCounts, status: string): void {
  if (status in counts) counts[status as AttendanceStatus] += 1;
}

/** Total number of session slots (all statuses). */
export function totalSlots(c: StatusCounts): number {
  return ATTENDANCE_ORDER.reduce((sum, k) => sum + c[k], 0);
}

/** Slots that count toward the attendance rate (excludes excused + unknown). */
export function relevantSlots(c: StatusCounts): number {
  return c.on_time + c.late_b + c.late_c + c.absent;
}

/** Attended = arrived at all, even if late. */
export function attended(c: StatusCounts): number {
  return c.on_time + c.late_b + c.late_c;
}

/** Attendance percentage (0–100) over relevant slots, or null when N/A. */
export function attendanceRate(c: StatusCounts): number | null {
  const rel = relevantSlots(c);
  if (rel === 0) return null;
  return Math.round((attended(c) / rel) * 100);
}

export function ratePercentText(rate: number | null): string {
  return rate === null ? "—" : `${rate}%`;
}

/* ------------------------------------------------------------------ *
 * Date helpers
 * ------------------------------------------------------------------ */

export function todayISO(): string {
  const d = new Date();
  return isoOf(d);
}

export function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function currentMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" -> { start: "YYYY-MM-01", end: "YYYY-MM-<last>" } */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, (m ?? 1) - 1, 1);
  const end = new Date(y, m ?? 1, 0);
  return { start: isoOf(start), end: isoOf(end) };
}

export function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoOf(d);
}

/** Longest run of consecutive calendar days within a set of ISO dates. */
export function longestConsecutiveStreak(isoDates: string[]): number {
  const uniq = Array.from(new Set(isoDates)).sort();
  if (uniq.length === 0) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < uniq.length; i += 1) {
    const prev = new Date(uniq[i - 1] + "T00:00:00");
    const now = new Date(uniq[i] + "T00:00:00");
    const diff = Math.round((now.getTime() - prev.getTime()) / 86_400_000);
    if (diff === 1) {
      cur += 1;
      best = Math.max(best, cur);
    } else if (diff === 0) {
      // same day, ignore
    } else {
      cur = 1;
    }
  }
  return best;
}

export function statusLong(s: AttendanceStatus): string {
  return attendanceLabels[s];
}
export function statusShort(s: AttendanceStatus): string {
  return attendanceShort[s];
}

/* ------------------------------------------------------------------ *
 * Filter UI
 * ------------------------------------------------------------------ */

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-[10rem] flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Export toolbar
 * ------------------------------------------------------------------ */

export function ExportToolbar({
  buildDocument,
  disabled,
}: {
  /** Returns the export document, or null when there is nothing to export. */
  buildDocument: () => ReportDocument | null;
  disabled?: boolean;
}) {
  function run(kind: "excel" | "pdf" | "print") {
    let doc: ReportDocument | null;
    try {
      doc = buildDocument();
    } catch {
      toast.error("אירעה שגיאה בהכנת הדוח לייצוא");
      return;
    }
    if (!doc || !hasAnyRows(doc)) {
      toast.error("אין נתונים לייצוא");
      return;
    }
    try {
      if (kind === "excel") {
        exportToExcel(doc);
        toast.success("הקובץ יוצא בהצלחה");
      } else if (kind === "pdf") {
        exportToPDF(doc);
        toast.success('נפתח חלון הדפסה — לשמירת PDF בחרו "שמירה כ-PDF" ביעד');
      } else {
        printReport(doc);
        toast.success("נפתח חלון הדפסה");
      }
    } catch {
      toast.error(
        kind === "excel" ? "ייצוא ה-Excel נכשל" : kind === "pdf" ? "ייצוא ה-PDF נכשל" : "ההדפסה נכשלה",
      );
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => run("excel")}>
        <FileSpreadsheet className="h-4 w-4" />
        ייצוא ל-Excel
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => run("pdf")}>
        <FileText className="h-4 w-4" />
        ייצוא ל-PDF
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => run("print")}>
        <Printer className="h-4 w-4" />
        הדפסה
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Sortable column header button
 * ------------------------------------------------------------------ */

export type SortDir = "asc" | "desc";

export function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "start",
}: {
  label: ReactNode;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "start" | "center" | "end";
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold transition-colors hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
        align === "center" && "justify-center",
        align === "end" && "justify-end",
      )}
    >
      {label}
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

/** Small hook to manage a sort key + direction. */
export function useSort<K extends string>(initialKey: K, initialDir: SortDir = "desc") {
  const [key, setKey] = useState<K>(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);
  function toggle(next: K) {
    if (next === key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setKey(next);
      setDir("desc");
    }
  }
  return { key, dir, toggle };
}

/* ------------------------------------------------------------------ *
 * Status distribution chart
 * ------------------------------------------------------------------ */

export function StatusDistribution({
  counts,
  height = 200,
}: {
  counts: StatusCounts;
  height?: number;
}) {
  const data = ATTENDANCE_ORDER.filter((s) => counts[s] > 0).map((s) => ({
    status: s,
    label: attendanceShort[s],
    value: counts[s],
    fill: STATUS_COLOR[s],
  }));

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        אין נתונים לתצוגה
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <RechartsTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
            formatter={(value: number, _n, item) => [
              value,
              attendanceLabels[(item?.payload?.status as AttendanceStatus) ?? "unknown"],
            ]}
            labelFormatter={() => ""}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.status} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Generic labelled bar chart (category → value). */
export function LabeledBars({
  data,
  height = 220,
  color = "var(--primary)",
  unit = "",
}: {
  data: { label: string; value: number; fill?: string }[];
  height?: number;
  color?: string;
  unit?: string;
}) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        אין נתונים לתצוגה
      </div>
    );
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            interval={0}
            angle={data.length > 6 ? -20 : 0}
            textAnchor={data.length > 6 ? "end" : "middle"}
            height={data.length > 6 ? 48 : 24}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <RechartsTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
            formatter={(value: number) => [`${value}${unit}`, ""]}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={color}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill ?? color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
