import { useState } from "react";
import { CalendarDays } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { startOfWeek, startOfMonth, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatHebrewDate } from "@/lib/hebrew";

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

interface DateRangePickerProps {
  from: Date;
  to: Date;
  onChange: (from: Date, to: Date) => void;
  className?: string;
}

export function DateRangePicker({ from, to, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  const label =
    formatHebrewDate(from, { day: "numeric", month: "short", year: "numeric" }) +
    " – " +
    formatHebrewDate(to, { day: "numeric", month: "short", year: "numeric" });

  function handleSelect(range: DateRange | undefined) {
    if (range?.from) {
      const end = range.to ?? range.from;
      onChange(range.from, end);
      if (range.to) setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-9 justify-start gap-2 font-normal", className)}
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
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
                setOpen(false);
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <Calendar
          mode="range"
          selected={{ from, to }}
          onSelect={handleSelect}
          numberOfMonths={1}
          defaultMonth={from}
          dir="rtl"
        />
      </PopoverContent>
    </Popover>
  );
}
