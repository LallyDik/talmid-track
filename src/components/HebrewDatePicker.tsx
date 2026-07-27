import { useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  ChevronLeft,
  ChevronsRight,
  ChevronsLeft,
} from "lucide-react";
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

/* בורר-תאריך בלוח העברי: גריד של חודש עברי אמיתי, ניווט חודש/שנה עברית, ימים
 * בגימטריה, הדגשת שבת וסימון חגים. הערך הנשמר הוא ISO לועזי (yyyy-mm-dd) — כך
 * ששאר המערכת ו-DB לא משתנים; רק התצוגה והבחירה עבריות. */

const WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"]; // ראשון..שבת

function isoToDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface HebrewDatePickerProps {
  value: string; // ISO yyyy-mm-dd (או "" כשאין)
  onChange: (iso: string) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  /** גבולות בחירה (ISO yyyy-mm-dd). ימים מחוץ לתחום אינם ניתנים לבחירה. */
  min?: string;
  max?: string;
}

export function HebrewDatePicker({
  value,
  onChange,
  id,
  className,
  placeholder = "בחר תאריך",
  disabled,
  min,
  max,
}: HebrewDatePickerProps) {
  const selected = isoToDate(value);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() =>
    hebrewMonthStart(selected ?? new Date()),
  );

  const days = hebrewMonthDays(viewMonth);
  const offset = days.length ? days[0].getDay() : 0; // 0=ראשון
  const selIso = selected ? dateToIso(selected) : "";
  const todayIso = dateToIso(new Date());

  // השוואת מחרוזות ISO (yyyy-mm-dd) שקולה להשוואה כרונולוגית.
  const outOfRange = (iso: string) =>
    (min && iso < min) || (max && iso > max) || false;

  function pick(d: Date) {
    const iso = dateToIso(d);
    if (outOfRange(iso)) return;
    onChange(iso);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setViewMonth(hebrewMonthStart(selected ?? new Date()));
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-start gap-2 font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="truncate">
            {selected ? formatHebrewDate(selected) : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start" dir="rtl">
        {/* ניווט. בכיוון עברי: ימין = אחורה (▶▶ שנה, ▶ חודש), שמאל = קדימה. */}
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
                i === 6 && "font-semibold text-foreground", // שבת
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
            const isSel = iso === selIso;
            const isToday = iso === todayIso;
            const isShabbat = d.getDay() === 6;
            const isDisabled = outOfRange(iso);
            const holiday = hebrewHoliday(d);
            return (
              <button
                key={iso}
                type="button"
                disabled={isDisabled}
                onClick={() => pick(d)}
                aria-pressed={isSel}
                title={holiday ?? undefined}
                className={cn(
                  "relative flex h-9 w-8 flex-col items-center justify-center gap-0.5 rounded-md text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isShabbat && !isSel && "bg-accent/60", // שבת מודגשת
                  isToday && !isSel && "font-semibold ring-1 ring-primary/50",
                  isSel && "bg-primary text-primary-foreground hover:bg-primary",
                  isDisabled && "pointer-events-none opacity-30",
                )}
              >
                <span className="leading-none">{toGematria(hebrewDayOfMonth(d))}</span>
                {holiday && (
                  <span
                    className={cn(
                      "h-1 w-1 rounded-full",
                      isSel ? "bg-primary-foreground" : "bg-[color:var(--status-late-b)]",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* מקרא: חג/מועד מסומן בנקודה */}
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--status-late-b)]" />
            חג / מועד
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            disabled={outOfRange(todayIso)}
            onClick={() => {
              const t = new Date();
              setViewMonth(hebrewMonthStart(t));
              pick(t);
            }}
          >
            היום
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
