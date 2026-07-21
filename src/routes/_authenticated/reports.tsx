import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { CalendarClock, CalendarRange, GraduationCap, Clock, UserX } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { PageSkeleton } from "@/components/kit";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { DailyAttendanceReport } from "@/components/reports/DailyAttendanceReport";
import { MonthlyAttendanceReport } from "@/components/reports/MonthlyAttendanceReport";
import { ClassComparisonReport } from "@/components/reports/ClassComparisonReport";
import { LatenessReport } from "@/components/reports/LatenessReport";
import { AbsenceReport } from "@/components/reports/AbsenceReport";
import type { ReportProps } from "@/components/reports/shared";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

type LucideIcon = ComponentType<{ className?: string }>;

interface ReportTab {
  value: string;
  label: string;
  icon: LucideIcon;
  Component: ComponentType<ReportProps>;
}

const TABS: ReportTab[] = [
  { value: "daily", label: "נוכחות יומי", icon: CalendarClock, Component: DailyAttendanceReport },
  { value: "monthly", label: "נוכחות חודשי", icon: CalendarRange, Component: MonthlyAttendanceReport },
  { value: "class", label: "לפי שיעור", icon: GraduationCap, Component: ClassComparisonReport },
  { value: "lateness", label: "איחורים", icon: Clock, Component: LatenessReport },
  { value: "absence", label: "היעדרויות", icon: UserX, Component: AbsenceReport },
];

function ReportsPage() {
  const { user } = useAuth();
  const { data: profileData } = useProfile(user?.id);
  const yeshivaId = profileData?.profile?.yeshiva_id ?? undefined;

  const { data: yeshivaName } = useQuery({
    queryKey: ["yeshiva-name", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => {
      const { data } = await supabase
        .from("yeshivas")
        .select("name")
        .eq("id", yeshivaId!)
        .maybeSingle();
      return data?.name ?? "";
    },
  });

  return (
    <div>
      <PageHeader
        title="דוחות וניתוחים"
        subtitle="הפקה, סינון וייצוא של דוחות נוכחות. הדוחות כוללים אך ורק נוכחות מאושרת (לא כולל טיוטות זיהוי)."
      />

      {!yeshivaId ? (
        <PageSkeleton stats={0} />
      ) : (
        <Tabs defaultValue="daily" dir="rtl" className="space-y-5">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                  <Icon className="h-4 w-4" />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {TABS.map((t) => {
            const Component = t.Component;
            return (
              <TabsContent key={t.value} value={t.value}>
                <Component yeshivaId={yeshivaId} yeshivaName={yeshivaName ?? ""} />
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}
