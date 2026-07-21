import { useMemo, useState } from "react";
import { CalendarDays, CalendarRange, ListFilter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, EmptyState, StatusBadge, type Column } from "@/components/kit";
import { formatHebrewDate } from "@/lib/hebrew";
import { AttendanceCalendar } from "./AttendanceCalendar";
import {
  useStudentAttendance,
  useStudySessions,
  type AttendanceRecordRow,
} from "./shared";

type ViewMode = "table" | "calendar";

export function AttendanceTab({
  studentId,
  yeshivaId,
}: {
  studentId: string;
  yeshivaId?: string;
}) {
  const { data: records, isLoading } = useStudentAttendance(studentId);
  const { data: sessions } = useStudySessions(yeshivaId);

  const [view, setView] = useState<ViewMode>("table");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sessionId, setSessionId] = useState("all");

  const filtered = useMemo(() => {
    return (records ?? []).filter((r) => {
      if (from && r.report_date < from) return false;
      if (to && r.report_date > to) return false;
      if (sessionId !== "all" && r.study_session_id !== sessionId) return false;
      return true;
    });
  }, [records, from, to, sessionId]);

  const hasFilters = from !== "" || to !== "" || sessionId !== "all";

  const columns: Column<AttendanceRecordRow>[] = [
    {
      key: "report_date",
      header: "תאריך",
      cell: (r) => formatHebrewDate(r.report_date),
    },
    {
      key: "session",
      header: "סדר",
      cell: (r) => r.study_sessions?.name ?? "—",
    },
    {
      key: "status",
      header: "סטטוס",
      cell: (r) => <StatusBadge kind="attendance" status={r.attendance_status} long />,
    },
    {
      key: "source",
      header: "מקור הדיווח",
      cell: (r) => (r.attendance_report_id ? "דוח נוכחות" : "רישום ידני"),
    },
    {
      key: "auto",
      header: "זוהה אוטומטית",
      cell: (r) => (r.detected_automatically ? "כן" : "לא"),
    },
    {
      key: "notes",
      header: "הערה",
      cell: (r) => r.notes ?? "—",
    },
  ];

  return (
    <div className="space-y-4">
      {/* View switch */}
      <div className="flex items-center gap-2">
        <Button
          variant={view === "table" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("table")}
        >
          <ListFilter className="h-4 w-4" />
          טבלה
        </Button>
        <Button
          variant={view === "calendar" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("calendar")}
        >
          <CalendarDays className="h-4 w-4" />
          לוח חודשי
        </Button>
      </div>

      {view === "table" ? (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="space-y-1">
              <Label className="text-xs">מתאריך</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">עד תאריך</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">סדר לימוד</Label>
              <Select value={sessionId} onValueChange={setSessionId}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הסדרים</SelectItem>
                  {sessions?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFrom("");
                  setTo("");
                  setSessionId("all");
                }}
              >
                <X className="h-4 w-4" />
                נקה סינון
              </Button>
            )}
          </div>

          <DataTable
            columns={columns}
            data={filtered}
            rowKey={(r) => r.id}
            loading={isLoading}
            pageSize={15}
            empty={
              <EmptyState
                icon={CalendarRange}
                title={hasFilters ? "אין רשומות מתאימות לסינון" : "אין רשומות נוכחות"}
                description={
                  hasFilters
                    ? "נסה לשנות את טווח התאריכים או את הסדר שנבחר."
                    : "רשומות נוכחות יופיעו כאן לאחר אישור דוחות נוכחות."
                }
              />
            }
          />
        </>
      ) : (
        <AttendanceCalendar records={records ?? []} />
      )}
    </div>
  );
}
