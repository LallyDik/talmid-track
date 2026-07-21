import { isValidElement, type ComponentType, type ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type IconLike = ComponentType<{ className?: string }> | ReactNode;

export interface SectionCardProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconLike;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Remove default content padding (e.g. when embedding a table). */
  noPadding?: boolean;
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

/** Titled card container with an optional icon, description and header actions. */
export function SectionCard({
  title,
  description,
  icon,
  actions,
  children,
  className,
  contentClassName,
  noPadding = false,
}: SectionCardProps) {
  return (
    <Card className={cn("shadow-soft rounded-2xl border-border/70", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-start gap-3">
          {icon != null && (
            <div
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary"
              style={{
                backgroundColor: "color-mix(in oklch, var(--primary) 12%, transparent)",
              }}
            >
              {renderIcon(icon)}
            </div>
          )}
          <div className="space-y-1">
            <CardTitle className="text-base">{title}</CardTitle>
            {description != null && <CardDescription>{description}</CardDescription>}
          </div>
        </div>
        {actions != null && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </CardHeader>
      <CardContent className={cn(noPadding && "p-0", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
