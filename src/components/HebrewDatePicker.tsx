import { useState } from "react";
import { CalendarDays, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatHebrewDate, toGematria } from "@/lib/hebrew";
import {
  hebrewMonthStart,
  hebrewMonthDays,
  hebrewDayOfMonth,
  addHebrewMonths,
} from "@/lib/hebrewCalendar";

/* בורר-תאריך בלוח העברי: גריד של חודש עברי אמיתי (ניווט חודש-עברי אחד בכל פעם),
 * ימים בגימטריה. הערך הנשמר הוא ISO לועזי (yyyy-mm-dd) — כך ששאר המערכת ו-DB
 * לא משתנים; רק התצוגה והבחירה עבריות. */

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
}

export function HebrewDatePicker({
  value,
  onChange,
  id,
  className,
  placeholder = "בחר תאריך",
  disabled,
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

  function pick(d: Date) {
    onChange(dateToIso(d));
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
        {/* כותרת החודש + ניווט (ChevronRight=קודם, ChevronLeft=הבא — כיוון עברי) */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="החודש הבא"
            onClick={() => setViewMonth((m) => addHebrewMonths(m, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-32 text-center text-sm font-medium">
            {formatHebrewDate(viewMonth, { month: "long", year: "numeric" })}
          </div>
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

        <div className="grid grid-cols-7 gap-0.5 text-center">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1 text-[0.7rem] font-normal text-muted-foreground">
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
            return (
              <button
                key={iso}
                type="button"
                onClick={() => pick(d)}
                aria-pressed={isSel}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isToday && !isSel && "bg-accent/60 font-semibold",
                  isSel && "bg-primary text-primary-foreground hover:bg-primary",
                )}
              >
                {toGematria(hebrewDayOfMonth(d))}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex justify-start">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
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
