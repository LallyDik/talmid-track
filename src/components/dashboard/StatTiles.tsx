import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Users,
  UserCheck,
  Clock,
  UserX,
  HeartPulse,
  AlarmClockOff,
  FileClock,
} from "lucide-react";
import { StatCard, type StatTone } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DashboardTiles } from "@/hooks/useDashboardData";

type CountMode = "student" | "session";

function TileLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  );
}

interface StatTilesProps {
  tiles?: DashboardTiles;
  loading?: boolean;
}

export function StatTiles({ tiles, loading }: StatTilesProps) {
  const [mode, setMode] = useState<CountMode>("student");

  if (loading || !tiles) {
    return (
      <section aria-busy className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-[116px] rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }

  const present = mode === "student" ? tiles.presentTodayByStudent : tiles.presentTodayBySession;
  const late = mode === "student" ? tiles.lateTodayByStudent : tiles.lateTodayBySession;
  const absent = mode === "student" ? tiles.absentTodayByStudent : tiles.absentTodayBySession;
  const modeHint = mode === "student" ? "ספירה לפי בחור" : "ספירה לפי סדר";

  type Tile = {
    label: string;
    value: number;
    hint?: string;
    icon: typeof Users;
    tone: StatTone;
    to?: string;
  };

  const tileList: Tile[] = [
    { label: "בחורים פעילים", value: tiles.activeStudents, icon: Users, tone: "teal" },
    {
      label: "נוכחים היום",
      value: present,
      hint: `כולל מאחרים · ${modeHint}`,
      icon: UserCheck,
      tone: "green",
    },
    { label: "מאחרים היום", value: late, hint: modeHint, icon: Clock, tone: "amber" },
    { label: "נעדרים היום", value: absent, hint: modeHint, icon: UserX, tone: "red" },
    { label: "טיפולים פתוחים", value: tiles.openTreatments, icon: HeartPulse, tone: "violet" },
    { label: "משימות באיחור", value: tiles.overdueTasks, icon: AlarmClockOff, tone: "orange" },
    {
      label: "דוחות שממתינים לאישור",
      value: tiles.pendingReports,
      hint: "מעבר לדוחות הנוכחות",
      icon: FileClock,
      tone: "blue",
      to: "/attendance/reports",
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">סקירה יומית</h2>
        <Tabs value={mode} onValueChange={(v) => setMode(v as CountMode)}>
          <TabsList className="h-8">
            <TabsTrigger value="student" className="text-xs">
              לפי בחור
            </TabsTrigger>
            <TabsTrigger value="session" className="text-xs">
              לפי סדר
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tileList.map((t) => {
          const card = (
            <StatCard
              label={t.label}
              value={t.value}
              hint={t.hint}
              icon={t.icon}
              tone={t.tone}
              className={t.to ? "transition-transform hover:-translate-y-0.5" : undefined}
            />
          );
          return t.to ? (
            <TileLink key={t.label} to={t.to}>
              {card}
            </TileLink>
          ) : (
            <div key={t.label}>{card}</div>
          );
        })}
      </div>
    </section>
  );
}
