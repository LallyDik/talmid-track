import { useNavigate } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarRange,
  Layers,
  GraduationCap,
  Clock,
  UserX,
  TrendingUp,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DashboardCharts as ChartsData } from "@/hooks/useDashboardData";
import { ChartCard } from "./ChartCard";
import { statusColor, chartColor, axisTickStyle, gridColor } from "./chartUtils";

const containerClass = "aspect-auto h-full w-full";

const percentTick = (v: number) => `${v}%`;

/** Tooltip value formatter that appends a percent sign. */
function percentValue(value: unknown) {
  return (
    <span className="font-mono font-medium tabular-nums text-foreground">
      {typeof value === "number" ? value : String(value)}%
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * 1. נוכחות לפי יום — stacked area of daily on-time / late / absent
 * ------------------------------------------------------------------ */
function AttendanceByDay({ data, loading }: { data: ChartsData["byDay"]; loading: boolean }) {
  const config: ChartConfig = {
    onTime: { label: "בזמן", color: statusColor.onTime },
    late: { label: "מאחרים", color: statusColor.late },
    absent: { label: "נעדרים", color: statusColor.absent },
  };
  return (
    <ChartCard
      title="נוכחות לפי יום"
      description="הרכב הנוכחות היומי לאורך הטווח הנבחר"
      icon={CalendarRange}
      loading={loading}
      isEmpty={data.length === 0}
      height={300}
    >
      <ChartContainer config={config} className={containerClass}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={gridColor} strokeOpacity={0.6} />
          <XAxis
            dataKey="label"
            reversed
            tick={axisTickStyle}
            tickLine={false}
            axisLine={false}
            minTickGap={16}
          />
          <YAxis orientation="right" tick={axisTickStyle} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Area
            type="monotone"
            dataKey="onTime"
            stackId="a"
            stroke="var(--color-onTime)"
            fill="var(--color-onTime)"
            fillOpacity={0.25}
          />
          <Area
            type="monotone"
            dataKey="late"
            stackId="a"
            stroke="var(--color-late)"
            fill="var(--color-late)"
            fillOpacity={0.25}
          />
          <Area
            type="monotone"
            dataKey="absent"
            stackId="a"
            stroke="var(--color-absent)"
            fill="var(--color-absent)"
            fillOpacity={0.25}
          />
        </AreaChart>
      </ChartContainer>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ *
 * 2. אחוז נוכחות לפי סדר — bar
 * ------------------------------------------------------------------ */
function RateBySession({ data, loading }: { data: ChartsData["bySession"]; loading: boolean }) {
  const config: ChartConfig = { rate: { label: "אחוז נוכחות", color: chartColor.c1 } };
  return (
    <ChartCard
      title="אחוז נוכחות לפי סדר"
      description="שיעור הנוכחות בכל סדר לימוד"
      icon={Layers}
      loading={loading}
      isEmpty={data.length === 0}
    >
      <ChartContainer config={config} className={containerClass}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={gridColor} strokeOpacity={0.6} />
          <XAxis dataKey="name" reversed tick={axisTickStyle} tickLine={false} axisLine={false} interval={0} />
          <YAxis
            orientation="right"
            domain={[0, 100]}
            tickFormatter={percentTick}
            tick={axisTickStyle}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <ChartTooltip content={<ChartTooltipContent formatter={percentValue} />} />
          <Bar dataKey="rate" fill="var(--color-rate)" radius={[6, 6, 0, 0]} maxBarSize={56} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ *
 * 3. אחוז נוכחות לפי שיעור — bar
 * ------------------------------------------------------------------ */
function RateByClass({ data, loading }: { data: ChartsData["byClass"]; loading: boolean }) {
  const config: ChartConfig = { rate: { label: "אחוז נוכחות", color: chartColor.c1 } };
  return (
    <ChartCard
      title="אחוז נוכחות לפי שיעור"
      description="שיעור הנוכחות בכל שיעור"
      icon={GraduationCap}
      loading={loading}
      isEmpty={data.length === 0}
    >
      <ChartContainer config={config} className={containerClass}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={gridColor} strokeOpacity={0.6} />
          <XAxis dataKey="name" reversed tick={axisTickStyle} tickLine={false} axisLine={false} interval={0} />
          <YAxis
            orientation="right"
            domain={[0, 100]}
            tickFormatter={percentTick}
            tick={axisTickStyle}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <ChartTooltip content={<ChartTooltipContent formatter={percentValue} />} />
          <Bar dataKey="rate" fill="var(--color-rate)" radius={[6, 6, 0, 0]} maxBarSize={56} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ *
 * 4. כמות איחורים לפי שבוע — bar
 * ------------------------------------------------------------------ */
function LatesByWeek({ data, loading }: { data: ChartsData["byWeek"]; loading: boolean }) {
  const config: ChartConfig = { late: { label: "איחורים", color: statusColor.late } };
  return (
    <ChartCard
      title="כמות איחורים לפי שבוע"
      description="מספר האיחורים בכל שבוע (מתחיל ביום ראשון)"
      icon={Clock}
      loading={loading}
      isEmpty={data.length === 0}
    >
      <ChartContainer config={config} className={containerClass}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={gridColor} strokeOpacity={0.6} />
          <XAxis dataKey="label" reversed tick={axisTickStyle} tickLine={false} axisLine={false} interval={0} />
          <YAxis orientation="right" tick={axisTickStyle} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="late" fill="var(--color-late)" radius={[6, 6, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ *
 * 5 & 6. Top-10 horizontal bars with clickable student names
 * ------------------------------------------------------------------ */
interface TickProps {
  x?: number;
  y?: number;
  payload?: { value?: string };
  nameById?: Map<string, string>;
  onSelect?: (id: string) => void;
}

function StudentTick({ x = 0, y = 0, payload, nameById, onSelect }: TickProps) {
  const id = payload?.value ?? "";
  const name = nameById?.get(id) ?? id;
  return (
    <text
      x={x}
      y={y}
      dx={6}
      dy={4}
      textAnchor="start"
      className="cursor-pointer fill-foreground text-[11px] hover:underline"
      onClick={() => id && onSelect?.(id)}
    >
      {name.length > 14 ? `${name.slice(0, 13)}…` : name}
    </text>
  );
}

function TopStudentsBar({
  data,
  loading,
  title,
  description,
  icon,
  color,
  countLabel,
}: {
  data: ChartsData["topAbsent"];
  loading: boolean;
  title: string;
  description: string;
  icon: typeof UserX;
  color: string;
  countLabel: string;
}) {
  const navigate = useNavigate();
  const nameById = new Map(data.map((d) => [d.id, d.name]));
  const config: ChartConfig = { count: { label: countLabel, color } };

  function select(id: string) {
    navigate({ to: "/students/$id", params: { id } });
  }

  return (
    <ChartCard
      title={title}
      description={description}
      icon={icon}
      loading={loading}
      isEmpty={data.length === 0}
      emptyTitle="אין נתונים לתצוגה"
      emptyDescription="לא נמצאו רשומות לטווח ולסינון שנבחרו."
    >
      <ChartContainer config={config} className={containerClass}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
          barCategoryGap={6}
        >
          <CartesianGrid horizontal={false} stroke={gridColor} strokeOpacity={0.5} />
          <XAxis type="number" reversed hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="id"
            orientation="right"
            width={110}
            tickLine={false}
            axisLine={false}
            tick={<StudentTick nameById={nameById} onSelect={select} />}
          />
          <ChartTooltip
            content={<ChartTooltipContent labelKey="count" />}
            labelFormatter={(_, payload) => {
              const id = payload?.[0]?.payload?.id as string | undefined;
              return id ? (nameById.get(id) ?? "") : "";
            }}
          />
          <Bar
            dataKey="count"
            fill="var(--color-count)"
            radius={[6, 0, 0, 6]}
            maxBarSize={26}
            cursor="pointer"
            onClick={(entry: { id?: string }) => entry?.id && select(entry.id)}
          >
            <LabelList dataKey="count" position="left" offset={8} className="fill-muted-foreground text-[11px]" />
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ *
 * 7. מגמת נוכחות חודשית — line
 * ------------------------------------------------------------------ */
function MonthlyTrend({ data, loading }: { data: ChartsData["byMonth"]; loading: boolean }) {
  const config: ChartConfig = { rate: { label: "אחוז נוכחות", color: chartColor.c1 } };
  return (
    <ChartCard
      title="מגמת נוכחות חודשית"
      description="ממוצע הנוכחות בכל חודש בטווח הנבחר"
      icon={TrendingUp}
      loading={loading}
      isEmpty={data.length === 0}
    >
      <ChartContainer config={config} className={containerClass}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={gridColor} strokeOpacity={0.6} />
          <XAxis dataKey="label" reversed tick={axisTickStyle} tickLine={false} axisLine={false} interval={0} />
          <YAxis
            orientation="right"
            domain={[0, 100]}
            tickFormatter={percentTick}
            tick={axisTickStyle}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <ChartTooltip content={<ChartTooltipContent formatter={percentValue} />} />
          <Line
            type="monotone"
            dataKey="rate"
            stroke="var(--color-rate)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "var(--color-rate)" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ChartContainer>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ *
 * Layout of all seven charts
 * ------------------------------------------------------------------ */
export function DashboardCharts({
  charts,
  loading,
}: {
  charts?: ChartsData;
  loading: boolean;
}) {
  const empty: ChartsData = {
    byDay: [],
    bySession: [],
    byClass: [],
    byWeek: [],
    topAbsent: [],
    topLate: [],
    byMonth: [],
  };
  const c = charts ?? empty;

  return (
    <div className="space-y-5">
      <AttendanceByDay data={c.byDay} loading={loading} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <RateBySession data={c.bySession} loading={loading} />
        <RateByClass data={c.byClass} loading={loading} />
        <LatesByWeek data={c.byWeek} loading={loading} />
        <MonthlyTrend data={c.byMonth} loading={loading} />
        <TopStudentsBar
          data={c.topAbsent}
          loading={loading}
          title="הבחורים עם מספר ההיעדרויות הגבוה ביותר"
          description="10 המובילים בטווח הנבחר · לחיצה תפתח את הכרטיס"
          icon={UserX}
          color={statusColor.absent}
          countLabel="היעדרויות"
        />
        <TopStudentsBar
          data={c.topLate}
          loading={loading}
          title="הבחורים עם מספר האיחורים הגבוה ביותר"
          description="10 המובילים בטווח הנבחר · לחיצה תפתח את הכרטיס"
          icon={Clock}
          color={statusColor.late}
          countLabel="איחורים"
        />
      </div>
    </div>
  );
}
