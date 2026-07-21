import { isValidElement, type ComponentType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatTone =
  | "teal"
  | "green"
  | "amber"
  | "orange"
  | "red"
  | "blue"
  | "violet"
  | "grey";

const toneVar: Record<StatTone, string> = {
  teal: "var(--primary)",
  green: "var(--status-on-time)",
  amber: "var(--status-late-b)",
  orange: "var(--status-late-c)",
  red: "var(--status-absent)",
  blue: "var(--status-excused)",
  violet: "var(--chart-4)",
  grey: "var(--status-unknown)",
};

type IconLike = ComponentType<{ className?: string }> | ReactNode;

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconLike;
  tone?: StatTone;
  className?: string;
}

function renderIcon(icon: IconLike | undefined) {
  if (!icon) return null;
  if (isValidElement(icon)) return icon;
  if (
    typeof icon === "function" ||
    (typeof icon === "object" && icon !== null && "$$typeof" in icon)
  ) {
    const Icon = icon as ComponentType<{ className?: string }>;
    return <Icon className="h-5 w-5" />;
  }
  return icon;
}

/**
 * Colorful, friendly stat tile. Shows a label, a large value, an optional hint
 * and a tinted icon chip in the corner.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "teal",
  className,
}: StatCardProps) {
  const color = toneVar[tone];

  return (
    <div
      className={cn(
        "gradient-surface shadow-soft group relative overflow-hidden rounded-2xl border border-border/70 p-5 transition-shadow hover:shadow-card",
        className,
      )}
    >
      {/* soft tone glow */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-10 left-[-2.5rem] h-28 w-28 rounded-full opacity-40 blur-2xl"
        style={{ backgroundColor: `color-mix(in oklch, ${color} 40%, transparent)` }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold leading-none tracking-tight text-foreground">
            {value}
          </p>
          {hint != null && (
            <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
        {icon != null && (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: `color-mix(in oklch, ${color} 16%, transparent)`,
              color,
            }}
          >
            {renderIcon(icon)}
          </div>
        )}
      </div>
    </div>
  );
}
