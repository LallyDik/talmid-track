import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";
import { TableSkeleton } from "./Skeletons";

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Cell renderer. Defaults to the row's value at `key`. */
  cell?: (row: T, index: number) => ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
  headerClassName?: string;
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string | number;
  /** Rows per page. Pagination controls appear only when data exceeds this. */
  pageSize?: number;
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
  stickyHeader?: boolean;
  caption?: ReactNode;
}

const alignClass = {
  start: "text-start",
  center: "text-center",
  end: "text-end",
} as const;

/**
 * Generic table shell: sticky header, zebra rows, RTL alignment and built-in
 * Hebrew pagination.
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  pageSize = 10,
  loading = false,
  empty,
  onRowClick,
  className,
  stickyHeader = true,
  caption,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);

  const total = data.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount - 1);

  const rows = useMemo(
    () => data.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [data, safePage, pageSize],
  );

  if (loading) {
    return <TableSkeleton rows={Math.min(pageSize, 8)} columns={columns.length} className={className} />;
  }

  if (total === 0) {
    return (
      <>
        {empty ?? (
          <EmptyState
            icon={Table2}
            title="אין נתונים להצגה"
            description="לא נמצאו רשומות מתאימות."
          />
        )}
      </>
    );
  }

  const from = safePage * pageSize + 1;
  const to = Math.min(total, safePage * pageSize + pageSize);
  const showPagination = total > pageSize;

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-card", className)}>
      <div className="overflow-x-auto">
        <table className="w-full caption-bottom border-collapse text-sm">
          {caption != null && (
            <caption className="p-3 text-xs text-muted-foreground">{caption}</caption>
          )}
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    "bg-muted/70 px-3 py-2.5 text-xs font-semibold text-muted-foreground",
                    alignClass[col.align ?? "start"],
                    stickyHeader && "sticky top-0 z-10 backdrop-blur",
                    col.headerClassName,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const absoluteIndex = safePage * pageSize + i;
              return (
                <tr
                  key={rowKey(row, absoluteIndex)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b border-border/70 transition-colors last:border-0",
                    i % 2 === 1 && "bg-muted/25",
                    onRowClick && "cursor-pointer hover:bg-accent/40",
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-3 py-2.5 align-middle text-foreground",
                        alignClass[col.align ?? "start"],
                        col.className,
                      )}
                    >
                      {col.cell
                        ? col.cell(row, absoluteIndex)
                        : ((row as unknown as Record<string, ReactNode>)[col.key] ?? null)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-2.5">
          <p className="text-xs text-muted-foreground">
            מציג {from}–{to} מתוך {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
            >
              <ChevronRight className="h-4 w-4" />
              הקודם
            </Button>
            <span className="text-xs text-muted-foreground">
              עמוד {safePage + 1} מתוך {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
            >
              הבא
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
