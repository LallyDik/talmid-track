/**
 * Shared helpers for the dashboard charts — RTL axis defaults, token
 * colors and Hebrew formatters. Recharts is not RTL-aware on its own,
 * so category / time axes are reversed and value axes moved to the
 * right so charts read right-to-left.
 */

/** Attendance-status token colors (flip automatically in dark mode). */
export const statusColor = {
  onTime: "var(--status-on-time)",
  late: "var(--status-late-b)",
  lateC: "var(--status-late-c)",
  absent: "var(--status-absent)",
  excused: "var(--status-excused)",
  unknown: "var(--status-unknown)",
} as const;

/** Neutral chart palette tokens. */
export const chartColor = {
  c1: "var(--chart-1)",
  c2: "var(--chart-2)",
  c3: "var(--chart-3)",
  c4: "var(--chart-4)",
  c5: "var(--chart-5)",
} as const;

/** Grid + axis styling shared by every cartesian chart. */
export const axisTickStyle = { fontSize: 11 } as const;

export const gridColor = "var(--border)";

export function fmtPercent(n: number | string): string {
  return `${n}%`;
}
