import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BellRing,
  CheckCheck,
  ChevronLeft,
  CircleSlash,
  Play,
  ShieldAlert,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { StatCard, StatusBadge, EmptyState, PageSkeleton } from "@/components/kit";
import { cn } from "@/lib/utils";
import {
  formatHebrewDateTime,
  severityLabels,
  type Severity,
} from "@/lib/hebrew";
import {
  alertRuleDescriptors,
  alertRuleDescriptorMap,
  evaluateAlerts,
  type AlertRuleKey,
} from "@/services/alertsEngine";

export const Route = createFileRoute("/_authenticated/alerts")({
  component: AlertsPage,
});

type AlertRow = Database["public"]["Tables"]["alerts"]["Row"] & {
  students?: { full_name: string } | null;
  tasks?: { title: string } | null;
  student_treatments?: { title: string } | null;
  attendance_reports?: { report_date: string } | null;
};

const alertStatusLabels: Record<string, string> = {
  open: "פתוחה",
  resolved: "טופלה",
  dismissed: "נדחתה",
};

/** סדר הצגה של חומרות — מהחמור לקל. */
const SEVERITY_ORDER: Severity[] = ["urgent", "high", "medium", "low", "info"];

function AlertsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: profileData } = useProfile(user?.id);
  const yeshivaId = profileData?.profile?.yeshiva_id;

  const [severity, setSeverity] = useState("all");
  const [ruleKey, setRuleKey] = useState("all");
  const [studentId, setStudentId] = useState("all");
  const [status, setStatus] = useState("open");

  /* ----------------------------- queries ----------------------------- */
  const { data: alerts, isLoading } = useQuery({
    queryKey: ["alerts", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select(
          "*, students(full_name), tasks(title), student_treatments(title), attendance_reports(report_date)",
        )
        .eq("yeshiva_id", yeshivaId!)
        .order("triggered_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AlertRow[];
    },
  });

  const { data: students } = useQuery({
    queryKey: ["students-options", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, full_name")
        .eq("yeshiva_id", yeshivaId!)
        .order("full_name");
      return data ?? [];
    },
  });

  /* --------------------------- mutations ----------------------------- */
  const runCheck = useMutation({
    mutationFn: async () => {
      if (!yeshivaId) throw new Error("לא נמצאה ישיבה משויכת");
      return evaluateAlerts({ yeshivaId });
    },
    onSuccess: (res) => {
      if (res.created > 0) {
        toast.success(`הבדיקה הושלמה — נוצרו ${res.created} התראות חדשות`);
      } else {
        toast.success("הבדיקה הושלמה — לא נמצאו התראות חדשות");
      }
      qc.invalidateQueries({ queryKey: ["alerts", yeshivaId] });
    },
    onError: (e) => {
      toast.error("הרצת הבדיקה נכשלה", {
        description: e instanceof Error ? e.message : undefined,
      });
    },
  });

  const resolveAlert = useMutation({
    mutationFn: async ({
      id,
      nextStatus,
    }: {
      id: string;
      nextStatus: "resolved" | "dismissed";
    }) => {
      const { error } = await supabase
        .from("alerts")
        .update({
          status: nextStatus,
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, { nextStatus }) => {
      toast.success(
        nextStatus === "resolved" ? "ההתראה סומנה כטופלה" : "ההתראה נדחתה",
      );
      qc.invalidateQueries({ queryKey: ["alerts", yeshivaId] });
    },
    onError: (e) => {
      toast.error("עדכון ההתראה נכשל", {
        description: e instanceof Error ? e.message : undefined,
      });
    },
  });

  /* --------------------------- derived data -------------------------- */
  const openCount = useMemo(
    () => (alerts ?? []).filter((a) => a.status === "open").length,
    [alerts],
  );

  const stats = useMemo(() => {
    const all = alerts ?? [];
    const open = all.filter((a) => a.status === "open");
    return {
      open: open.length,
      critical: open.filter(
        (a) => a.severity === "urgent" || a.severity === "high",
      ).length,
      resolved: all.filter((a) => a.status === "resolved").length,
      dismissed: all.filter((a) => a.status === "dismissed").length,
    };
  }, [alerts]);

  const filtered = useMemo(() => {
    let rows = alerts ?? [];
    if (status !== "all") rows = rows.filter((a) => a.status === status);
    if (severity !== "all") rows = rows.filter((a) => a.severity === severity);
    if (ruleKey !== "all") rows = rows.filter((a) => a.rule_key === ruleKey);
    if (studentId !== "all")
      rows = rows.filter((a) => a.student_id === studentId);
    return rows;
  }, [alerts, status, severity, ruleKey, studentId]);

  const grouped = useMemo(() => {
    return SEVERITY_ORDER.map((sev) => ({
      severity: sev,
      items: filtered.filter((a) => a.severity === sev),
    })).filter((g) => g.items.length > 0);
  }, [filtered]);

  if (!yeshivaId || (isLoading && !alerts)) {
    return <PageSkeleton stats={4} rows={5} columns={4} />;
  }

  const hasAny = (alerts ?? []).length > 0;

  return (
    <div>
      <PageHeader
        title="התראות"
        subtitle="מנוע התראות אוטומטי על נוכחות, טיפולים ומשימות"
        actions={
          <>
            {openCount > 0 && (
              <Badge
                variant="destructive"
                className="h-9 gap-1 rounded-full px-3 text-sm"
              >
                <BellRing className="h-4 w-4" />
                {openCount} פתוחות
              </Badge>
            )}
            <Button
              onClick={() => runCheck.mutate()}
              disabled={runCheck.isPending}
            >
              <Play className="h-4 w-4" />
              {runCheck.isPending ? "מריץ בדיקה..." : "הרץ בדיקה עכשיו"}
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="פתוחות" value={stats.open} icon={BellRing} tone="orange" />
        <StatCard
          label="דחופות / גבוהות"
          value={stats.critical}
          icon={ShieldAlert}
          tone="red"
        />
        <StatCard label="טופלו" value={stats.resolved} icon={CheckCheck} tone="green" />
        <StatCard
          label="נדחו"
          value={stats.dismissed}
          icon={CircleSlash}
          tone="grey"
        />
      </div>

      {/* filters */}
      <div className="mb-5 rounded-2xl border border-border/70 bg-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField label="סטטוס">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="open">פתוחות</SelectItem>
                <SelectItem value="resolved">טופלו</SelectItem>
                <SelectItem value="dismissed">נדחו</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="חומרה">
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all">כל החומרות</SelectItem>
                {SEVERITY_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {severityLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="סוג התראה">
            <Select value={ruleKey} onValueChange={setRuleKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all">כל הסוגים</SelectItem>
                {alertRuleDescriptors.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="בחור">
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all">כל הבחורים</SelectItem>
                {(students ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        </div>
      </div>

      {/* list */}
      {!hasAny ? (
        <EmptyState
          icon={BellRing}
          title="אין התראות"
          description="המנוע לא העלה התראות עדיין. אפשר להריץ בדיקה ידנית כדי לסרוק את הנתונים."
          action={
            <Button onClick={() => runCheck.mutate()} disabled={runCheck.isPending}>
              <Play className="h-4 w-4" />
              הרץ בדיקה עכשיו
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CheckCheck}
          title="אין התראות התואמות לסינון"
          description="נסו לשנות את מסנני הסטטוס, החומרה או סוג ההתראה."
        />
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.severity}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <StatusBadge kind="severity" status={group.severity} />
                <span className="text-xs text-muted-foreground">
                  {group.items.length} התראות
                </span>
              </div>
              <div className="space-y-2">
                {group.items.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onResolve={() =>
                      resolveAlert.mutate({
                        id: alert.id,
                        nextStatus: "resolved",
                      })
                    }
                    onDismiss={() =>
                      resolveAlert.mutate({
                        id: alert.id,
                        nextStatus: "dismissed",
                      })
                    }
                    pending={resolveAlert.isPending}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Alert card
 * ------------------------------------------------------------------ */

function AlertCard({
  alert,
  onResolve,
  onDismiss,
  pending,
}: {
  alert: AlertRow;
  onResolve: () => void;
  onDismiss: () => void;
  pending: boolean;
}) {
  const descriptor = alertRuleDescriptorMap[alert.rule_key as AlertRuleKey];
  const isOpen = alert.status === "open";

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-4 shadow-soft",
        isOpen ? "border-border/70" : "border-border/50 opacity-75",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge kind="severity" status={alert.severity} />
            <span className="text-sm font-semibold text-foreground">
              {alert.title}
            </span>
            {descriptor && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {descriptor.title}
              </span>
            )}
            {!isOpen && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {alertStatusLabels[alert.status] ?? alert.status}
              </span>
            )}
          </div>

          {alert.body && (
            <p className="mt-1.5 text-sm text-muted-foreground">{alert.body}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>נוצרה: {formatHebrewDateTime(alert.triggered_at)}</span>
            {alert.resolved_at && (
              <span>עודכנה: {formatHebrewDateTime(alert.resolved_at)}</span>
            )}
            <AlertLink alert={alert} />
          </div>
        </div>

        {isOpen && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onResolve}
              disabled={pending}
            >
              <CheckCheck className="h-4 w-4" />
              סמן כטופל
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              disabled={pending}
            >
              <CircleSlash className="h-4 w-4" />
              דחה
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** קישור לישות המקושרת (דוח / בחור / משימה). */
function AlertLink({ alert }: { alert: AlertRow }) {
  const linkClass =
    "inline-flex items-center gap-0.5 font-medium text-primary hover:underline";

  if (alert.report_id) {
    return (
      <Link
        to="/attendance/verify/$id"
        params={{ id: alert.report_id }}
        className={linkClass}
      >
        פתיחת הדוח
        <ChevronLeft className="h-3 w-3" />
      </Link>
    );
  }
  if (alert.student_id) {
    return (
      <Link
        to="/students/$id"
        params={{ id: alert.student_id }}
        className={linkClass}
      >
        {alert.students?.full_name
          ? `כרטיס ${alert.students.full_name}`
          : "כרטיס הבחור"}
        <ChevronLeft className="h-3 w-3" />
      </Link>
    );
  }
  if (alert.task_id) {
    return (
      <Link to="/tasks" className={linkClass}>
        מעבר למשימות
        <ChevronLeft className="h-3 w-3" />
      </Link>
    );
  }
  return null;
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
