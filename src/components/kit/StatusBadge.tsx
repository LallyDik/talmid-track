import { cn } from "@/lib/utils";
import {
  attendanceLabels,
  attendanceShort,
  attendanceClass,
  studentStatusLabels,
  reportStatusLabels,
  treatmentStatusLabels,
  taskStatusLabels,
  severityLabels,
  severityClass,
} from "@/lib/hebrew";

export type StatusKind =
  | "attendance"
  | "student"
  | "report"
  | "treatment"
  | "task"
  | "severity";

export interface StatusBadgeProps {
  kind: StatusKind;
  status: string;
  /** For attendance: show the full label instead of the short glyph. */
  long?: boolean;
  className?: string;
}

const pillBase =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5 whitespace-nowrap";

/** soft tint class per state, per kind */
const softTone: Record<string, string> = {
  // student
  "student:active": "badge-green",
  "student:inactive": "badge-grey",
  "student:vacation": "badge-blue",
  "student:left": "badge-red",
  "student:suspended": "badge-amber",
  // report
  "report:pending": "badge-grey",
  "report:processing": "badge-blue",
  "report:needs_review": "badge-amber",
  "report:approved": "badge-green",
  "report:failed": "badge-red",
  // treatment
  "treatment:new": "badge-blue",
  "treatment:in_progress": "badge-teal",
  "treatment:waiting": "badge-amber",
  "treatment:completed": "badge-green",
  "treatment:cancelled": "badge-grey",
  // task
  "task:open": "badge-blue",
  "task:in_progress": "badge-teal",
  "task:completed": "badge-green",
  "task:cancelled": "badge-grey",
};

function resolve(kind: StatusKind, status: string): { label: string; colorClass: string } {
  switch (kind) {
    case "attendance": {
      const k = status as keyof typeof attendanceLabels;
      return {
        label: attendanceLabels[k] ?? status,
        colorClass: attendanceClass[k] ?? "badge-grey",
      };
    }
    case "severity": {
      const k = status as keyof typeof severityLabels;
      return {
        label: severityLabels[k] ?? status,
        colorClass: severityClass[k] ?? "badge-grey",
      };
    }
    case "student": {
      const k = status as keyof typeof studentStatusLabels;
      return {
        label: studentStatusLabels[k] ?? status,
        colorClass: softTone[`student:${status}`] ?? "badge-grey",
      };
    }
    case "report": {
      const k = status as keyof typeof reportStatusLabels;
      return {
        label: reportStatusLabels[k] ?? status,
        colorClass: softTone[`report:${status}`] ?? "badge-grey",
      };
    }
    case "treatment": {
      const k = status as keyof typeof treatmentStatusLabels;
      return {
        label: treatmentStatusLabels[k] ?? status,
        colorClass: softTone[`treatment:${status}`] ?? "badge-grey",
      };
    }
    case "task": {
      const k = status as keyof typeof taskStatusLabels;
      return {
        label: taskStatusLabels[k] ?? status,
        colorClass: softTone[`task:${status}`] ?? "badge-grey",
      };
    }
    default:
      return { label: status, colorClass: "badge-grey" };
  }
}

/**
 * Renders a colored Hebrew status badge for any of the app's enums.
 */
export function StatusBadge({ kind, status, long, className }: StatusBadgeProps) {
  const { label, colorClass } = resolve(kind, status);
  const text =
    kind === "attendance" && !long
      ? (attendanceShort[status as keyof typeof attendanceShort] ?? label)
      : label;

  return <span className={cn(pillBase, colorClass, className)}>{text}</span>;
}
