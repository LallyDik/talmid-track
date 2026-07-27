import { useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  ChevronLeft,
  ChevronsRight,
  ChevronsLeft,
} from "lucide-react";
import { startOfWeek, startOfMonth, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatHebrewDate, toGematria } from "@/lib/hebrew";
import {
  hebrewMonthStart,
  hebrewMonthDays,
  hebrewDayOfMonth,
  addHebrewMonths,
  hebrewHoliday,
} from "@/lib/hebrewCalendar";

export type RangePresetKey = "today" | "week" | "month" | "d30";

export function presetRange(key: RangePresetKey): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case "today":
      return { from: to, to };
    case "week":
      return { from: startOfWeek(to, { weekStartsOn: 0 }), to };
    case "month":
      return { from: startOfMonth(to), to };
    case "d30":
      return { from: subDays(to, 29), to };
  }
}

const presets: { key: RangePresetKey; label: string }[] = [
  { key: "today", label: "היום" },
  { key: "week", label: "השבוע" },
  { key: "month", label: "החודש" },
  { key: "d30", label: "30 יום" },
];

const WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"]; // ראשון..שבת

function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface DateRangePickerProps {
  from: Date;
  to: Date;
  onChange: (from: Date, to: Date) => void;
  className?: string;
}

export function DateRangePicker({ from, to, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => hebrewMonthStart(from));
  const [anchor, setAnchor] = useState<Date | null>(null); // תחילת בחירת-טווח חדשה

  const label =
    formatHebrewDate(from, { day: "numeric", month: "short", year: "numeric" }) +
    " – " +
    formatHebrewDate(to, { day: "numeric", month: "short", year: "numeric" });

  const days = hebrewMonthDays(viewMonth);
  const offset = days.length ? days[0].getDay() : 0;
  const fromIso = dateToIso(from);
  const toIso = dateToIso(to);
  const todayIso = dateToIso(new Date());

  function handleDayClick(d: Date) {
    if (!anchor) {
      // קליק ראשון — עוגן; מציג יום בודד עד הקליק השני.
      setAnchor(d);
      onChange(d, d);
    } else {
      const start = anchor <= d ? anchor : d;
      const end = anchor <= d ? d : anchor;
      onChange(start, end);
      setAnchor(null);
      setOpen(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setViewMonth(hebrewMonthStart(from));
          setAnchor(null);
        }
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-9 justify-start gap-2 font-normal", className)}
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" dir="rtl">
        <div className="flex flex-wrap gap-1.5 border-b border-border p-2">
          {presets.map((p) => (
            <Button
              key={p.key}
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                const r = presetRange(p.key);
                onChange(r.from, r.to);
                setAnchor(null);
                setOpen(false);
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <div className="p-3">
          {/* ניווט. ימין = אחורה (▶▶ שנה, ▶ חודש), שמאל = קדימה. */}
          <div className="mb-2 flex items-center justify-between gap-1">
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="שנה קודמת"
                onClick={() => setViewMonth((m) => addHebrewMonths(m, -12))}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="החודש הקודם"
                onClick={() => setViewMonth((m) => addHebrewMonths(m, -1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-w-28 text-center text-sm font-medium">
              {formatHebrewDate(viewMonth, { month: "long", year: "numeric" })}
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="החודש הבא"
                onClick={() => setViewMonth((m) => addHebrewMonths(m, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="שנה הבאה"
                onClick={() => setViewMonth((m) => addHebrewMonths(m, 12))}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={cn(
                  "py-1 text-[0.7rem] font-normal text-muted-foreground",
                  i === 6 && "font-semibold text-foreground",
                )}
              >
                {w}
              </div>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {days.map((d) => {
              const iso = dateToIso(d);
              const isStart = iso === fromIso;
              const isEnd = iso === toIso;
              const isEndpoint = isStart || isEnd;
              const inRange = iso > fromIso && iso < toIso;
              const isShabbat = d.getDay() === 6;
              const isToday = iso === todayIso;
              const holiday = hebrewHoliday(d);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => handleDayClick(d)}
                  title={holiday ?? undefined}
                  className={cn(
                    "relative flex h-9 w-8 flex-col items-center justify-center gap-0.5 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    inRange ? "rounded-none bg-accent" : "rounded-md",
                    isShabbat && !isEndpoint && !inRange && "bg-accent/60",
                    isToday && !isEndpoint && "ring-1 ring-primary/50",
                    isEndpoint && "bg-primary text-primary-foreground hover:bg-primary",
                  )}
                >
                  <span className="leading-none">{toGematria(hebrewDayOfMonth(d))}</span>
                  {holiday && (
                    <span
                      className={cn(
                        "h-1 w-1 rounded-full",
                        isEndpoint ? "bg-primary-foreground" : "bg-[color:var(--status-late-b)]",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--status-late-b)]" />
            חג / מועד
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
