import { isValidElement, type ComponentType, type ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

type IconLike = ComponentType<{ className?: string }> | ReactNode;

export interface EmptyStateProps {
  icon?: IconLike;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

function renderIcon(icon: IconLike | undefined) {
  if (icon === undefined) {
    return <Inbox className="h-7 w-7" />;
  }
  if (isValidElement(icon)) return icon;
  if (
    typeof icon === "function" ||
    (typeof icon === "object" && icon !== null && "$$typeof" in icon)
  ) {
    const Icon = icon as ComponentType<{ className?: string }>;
    return <Icon className="h-7 w-7" />;
  }
  return icon;
}

/**
 * Designed empty state — soft tinted icon medallion, Hebrew title/description
 * and an optional call-to-action.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-14 text-center",
        className,
      )}
    >
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-primary"
        style={{ backgroundColor: "color-mix(in oklch, var(--primary) 12%, transparent)" }}
      >
        {renderIcon(icon)}
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description != null && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action != null && <div className="mt-5">{action}</div>}
    </div>
  );
}
