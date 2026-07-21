import type { ComponentType, ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { SectionCard } from "@/components/kit";
import { EmptyState } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";

export interface ChartCardProps {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  /** Show the loading skeleton. */
  loading?: boolean;
  /** When true (and not loading), render the designed empty state. */
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Height of the plot area. */
  height?: number;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Card shell for a single chart. Renders a Skeleton while loading and a
 * friendly EmptyState (never an empty axis) when there is no data.
 */
export function ChartCard({
  title,
  description,
  icon = BarChart3,
  loading = false,
  isEmpty = false,
  emptyTitle = "אין נתונים לתצוגה",
  emptyDescription = "לא נמצאו נתוני נוכחות לטווח ולסינון שנבחרו.",
  height = 288,
  actions,
  children,
  className,
}: ChartCardProps) {
  return (
    <SectionCard title={title} description={description} icon={icon} actions={actions} className={className}>
      {loading ? (
        <Skeleton className="w-full rounded-xl" style={{ height }} />
      ) : isEmpty ? (
        <EmptyState
          icon={icon}
          title={emptyTitle}
          description={emptyDescription}
          className="py-10"
        />
      ) : (
        <div style={{ height }} className="w-full">
          {children}
        </div>
      )}
    </SectionCard>
  );
}
