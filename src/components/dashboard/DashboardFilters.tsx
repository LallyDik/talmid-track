import { RotateCcw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { attendanceLabels, type AttendanceStatus } from "@/lib/hebrew";
import type { DashboardFilters as Filters, FilterOption } from "@/hooks/useDashboardData";
import { DateRangePicker, presetRange } from "./DateRangePicker";

const ALL = "all";

const statusOrder: AttendanceStatus[] = [
  "on_time",
  "late_b",
  "late_c",
  "absent",
  "excused",
  "unknown",
];

interface DashboardFiltersProps {
  filters: Filters;
  onChange: (next: Filters) => void;
  options?: { classes: FilterOption[]; sessions: FilterOption[]; staff: FilterOption[] };
  optionsLoading?: boolean;
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-[9.5rem] flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function DashboardFilters({
  filters,
  onChange,
  options,
  optionsLoading,
}: DashboardFiltersProps) {
  const classes = options?.classes ?? [];
  const sessions = options?.sessions ?? [];
  const staff = options?.staff ?? [];

  const isDirty =
    filters.classId !== null ||
    filters.sessionId !== null ||
    filters.status !== null ||
    filters.staffId !== null;

  function reset() {
    const r = presetRange("month");
    onChange({ from: r.from, to: r.to, classId: null, sessionId: null, status: null, staffId: null });
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-soft">
      <div className="flex flex-wrap items-end gap-3">
        <FilterField label="טווח תאריכים">
          <DateRangePicker
            from={filters.from}
            to={filters.to}
            onChange={(from, to) => onChange({ ...filters, from, to })}
          />
        </FilterField>

        <FilterField label="שיעור">
          <Select
            value={filters.classId ?? ALL}
            onValueChange={(v) => onChange({ ...filters, classId: v === ALL ? null : v })}
            disabled={optionsLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder="כל השיעורים" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>כל השיעורים</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="סדר">
          <Select
            value={filters.sessionId ?? ALL}
            onValueChange={(v) => onChange({ ...filters, sessionId: v === ALL ? null : v })}
            disabled={optionsLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder="כל הסדרים" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>כל הסדרים</SelectItem>
              {sessions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="סטטוס נוכחות">
          <Select
            value={filters.status ?? ALL}
            onValueChange={(v) =>
              onChange({ ...filters, status: v === ALL ? null : (v as AttendanceStatus) })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="כל הסטטוסים" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>כל הסטטוסים</SelectItem>
              {statusOrder.map((s) => (
                <SelectItem key={s} value={s}>
                  {attendanceLabels[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="איש צוות">
          <Select
            value={filters.staffId ?? ALL}
            onValueChange={(v) => onChange({ ...filters, staffId: v === ALL ? null : v })}
            disabled={optionsLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder="כל אנשי הצוות" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>כל אנשי הצוות</SelectItem>
              {staff.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        {isDirty && (
          <Button variant="ghost" size="sm" onClick={reset} className="h-9 gap-1.5 text-muted-foreground">
            <RotateCcw className="h-4 w-4" />
            נקה סינון
          </Button>
        )}
      </div>
    </div>
  );
}
