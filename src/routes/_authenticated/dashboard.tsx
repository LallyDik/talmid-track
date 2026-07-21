import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import {
  useDashboardData,
  useDashboardFilterOptions,
  type DashboardFilters as Filters,
} from "@/hooks/useDashboardData";
import { formatHebrewDate } from "@/lib/hebrew";
import { StatTiles, DashboardFilters, DashboardCharts, presetRange } from "@/components/dashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function greetingFor(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? `ברוך הבא, ${first}` : "ברוך הבא";
}

function Dashboard() {
  const { user } = useAuth();
  const { data: profileData } = useProfile(user?.id);
  const profile = profileData?.profile;
  const yeshivaId = profile?.yeshiva_id ?? undefined;

  const [filters, setFilters] = useState<Filters>(() => {
    const r = presetRange("month");
    return { from: r.from, to: r.to, classId: null, sessionId: null, status: null, staffId: null };
  });

  const options = useDashboardFilterOptions(yeshivaId);
  const dashboard = useDashboardData(filters, yeshivaId);

  useEffect(() => {
    if (dashboard.isError) {
      toast.error("שגיאה בטעינת נתוני לוח הבקרה. נסו לרענן את העמוד.");
    }
  }, [dashboard.isError]);

  const loading = !yeshivaId || dashboard.isLoading;
  const today = useMemo(() => formatHebrewDate(new Date()), []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={greetingFor(profile?.full_name)}
        subtitle={`${today} · סקירת נוכחות ומעקב אחר הבחורים`}
      />

      <DashboardFilters
        filters={filters}
        onChange={setFilters}
        options={options.data}
        optionsLoading={options.isLoading}
      />

      {dashboard.isError && (
        <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>לא ניתן היה לטעון חלק מהנתונים. ודאו חיבור לרשת ונסו שוב.</span>
        </div>
      )}

      <StatTiles tiles={dashboard.data?.tiles} loading={loading} />

      <DashboardCharts charts={dashboard.data?.charts} loading={loading} />
    </div>
  );
}
