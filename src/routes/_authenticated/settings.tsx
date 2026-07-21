import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Clock,
  Tags,
  ClipboardList,
  BellRing,
  CalendarDays,
  Building2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import {
  DEFAULT_EVENT_TYPES,
  DEFAULT_TREATMENT_TYPES,
  severityLabels,
  type Severity,
} from "@/lib/hebrew";
import { SectionCard, EmptyState, ConfirmDialog, TableSkeleton } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// The alert rule descriptor list is authored by the alerts engine (another
// agent). We normalize it defensively so shape differences do not break this
// screen.
import { alertRuleDescriptors } from "@/services/alertsEngine";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

/* ================================================================ *
 * Shared helpers
 * ================================================================ */

function normalizeTime(t: string | null | undefined): string {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function toMinutes(t: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(normalizeTime(t));
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Returns a Hebrew error string when the three thresholds are not increasing. */
function validateThresholds(start: string, b: string, c: string): string | null {
  const s = toMinutes(start);
  const mb = toMinutes(b);
  const mc = toMinutes(c);
  if (s === null || mb === null || mc === null) return "יש להזין שעות תקינות בכל השדות";
  if (!(s < mb && mb < mc)) return "השעות חייבות לעלות: התחלה < סף ב׳ < סף ג׳";
  return null;
}

type AppSettingsRow = Tables<"app_settings">;

function appSettingsPayload(
  yeshivaId: string,
  row: AppSettingsRow | null | undefined,
  override: Partial<Pick<AppSettingsRow, "event_types" | "treatment_types" | "active_school_year">>,
): TablesInsert<"app_settings"> {
  return {
    yeshiva_id: yeshivaId,
    event_types: override.event_types ?? row?.event_types ?? [...DEFAULT_EVENT_TYPES],
    treatment_types:
      override.treatment_types ?? row?.treatment_types ?? [...DEFAULT_TREATMENT_TYPES],
    active_school_year:
      "active_school_year" in override
        ? override.active_school_year ?? null
        : row?.active_school_year ?? null,
    updated_at: new Date().toISOString(),
  };
}

function useAppSettings(yeshivaId: string) {
  return useQuery({
    queryKey: ["app-settings", yeshivaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("yeshiva_id", yeshivaId)
        .maybeSingle();
      if (error) throw error;
      return data; // AppSettingsRow | null
    },
  });
}

/* ================================================================ *
 * Page
 * ================================================================ */

function SettingsPage() {
  const { user } = useAuth();
  const { data: profileData, isLoading } = useProfile(user?.id);
  const yeshivaId = profileData?.profile?.yeshiva_id ?? undefined;

  return (
    <div>
      <PageHeader title="הגדרות" subtitle="ניהול סדרי הלימוד, סוגי אירועים וטיפולים, התראות ופרטי הישיבה" />

      {isLoading ? (
        <TableSkeleton rows={6} columns={3} />
      ) : !yeshivaId ? (
        <EmptyState
          icon={Building2}
          title="לא נמצאה ישיבה"
          description="יש להשלים את הקליטה הראשונית לפני עריכת ההגדרות."
        />
      ) : (
        <Tabs defaultValue="sessions" dir="rtl" className="w-full">
          <TabsList className="mb-6 flex h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="sessions" className="gap-1.5">
              <Clock className="h-4 w-4" /> סדרי לימוד
            </TabsTrigger>
            <TabsTrigger value="events" className="gap-1.5">
              <Tags className="h-4 w-4" /> סוגי אירועים
            </TabsTrigger>
            <TabsTrigger value="treatments" className="gap-1.5">
              <ClipboardList className="h-4 w-4" /> סוגי טיפולים
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-1.5">
              <BellRing className="h-4 w-4" /> ספי התראות
            </TabsTrigger>
            <TabsTrigger value="year" className="gap-1.5">
              <CalendarDays className="h-4 w-4" /> שנת לימודים
            </TabsTrigger>
            <TabsTrigger value="yeshiva" className="gap-1.5">
              <Building2 className="h-4 w-4" /> פרטי הישיבה
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sessions">
            <SessionsTab yeshivaId={yeshivaId} />
          </TabsContent>
          <TabsContent value="events">
            <StringListTab
              yeshivaId={yeshivaId}
              field="event_types"
              title="סוגי אירועים"
              description="הרשימה שממנה בוחרים בעת תיעוד אירוע לבחור."
              icon={Tags}
              defaults={[...DEFAULT_EVENT_TYPES]}
              addLabel="הוסף סוג אירוע"
              successText="סוגי האירועים נשמרו"
            />
          </TabsContent>
          <TabsContent value="treatments">
            <StringListTab
              yeshivaId={yeshivaId}
              field="treatment_types"
              title="סוגי טיפולים"
              description="הרשימה שממנה בוחרים בעת פתיחת טיפול לבחור."
              icon={ClipboardList}
              defaults={[...DEFAULT_TREATMENT_TYPES]}
              addLabel="הוסף סוג טיפול"
              successText="סוגי הטיפולים נשמרו"
            />
          </TabsContent>
          <TabsContent value="alerts">
            <AlertRulesTab yeshivaId={yeshivaId} />
          </TabsContent>
          <TabsContent value="year">
            <SchoolYearTab yeshivaId={yeshivaId} />
          </TabsContent>
          <TabsContent value="yeshiva">
            <YeshivaDetailsTab yeshivaId={yeshivaId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/* ================================================================ *
 * Study sessions
 * ================================================================ */

type StudySession = Tables<"study_sessions">;
interface SessionDraft {
  name: string;
  start_time: string;
  late_time_b: string;
  late_time_c: string;
}

function SessionTimeline({ start, b, c }: { start: string; b: string; c: string }) {
  const s = toMinutes(start);
  const mb = toMinutes(b);
  const mc = toMinutes(c);
  if (s === null || mb === null || mc === null || !(s < mb && mb < mc)) return null;
  const span = mc - s;
  const greenPct = ((mb - s) / span) * 100;
  const amberPct = 100 - greenPct;

  return (
    <div dir="ltr" className="mt-1">
      <div className="flex h-2.5 items-stretch overflow-hidden rounded-full">
        <div
          style={{ width: `${greenPct}%`, backgroundColor: "var(--status-on-time)" }}
          title="א׳"
        />
        <div
          style={{ width: `${amberPct}%`, backgroundColor: "var(--status-late-b)" }}
          title="ב׳"
        />
        <div className="w-6 shrink-0" style={{ backgroundColor: "var(--status-late-c)" }} title="ג׳" />
      </div>
      <div dir="rtl" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--status-on-time)" }} />
          א׳ עד {normalizeTime(b)}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--status-late-b)" }} />
          ב׳ {normalizeTime(b)}–{normalizeTime(c)}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--status-late-c)" }} />
          ג׳ אחרי {normalizeTime(c)}
        </span>
      </div>
    </div>
  );
}

function SessionsTab({ yeshivaId }: { yeshivaId: string }) {
  const qc = useQueryClient();
  const { data: sessions, isLoading } = useQuery({
    queryKey: ["settings-sessions", yeshivaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("study_sessions")
        .select("*")
        .eq("yeshiva_id", yeshivaId)
        .order("order_index");
      if (error) throw error;
      return (data ?? []) as StudySession[];
    },
  });

  const [drafts, setDrafts] = useState<Record<string, SessionDraft>>({});
  useEffect(() => {
    if (!sessions) return;
    const d: Record<string, SessionDraft> = {};
    for (const s of sessions) {
      d[s.id] = {
        name: s.name,
        start_time: normalizeTime(s.start_time),
        late_time_b: normalizeTime(s.late_time_b),
        late_time_c: normalizeTime(s.late_time_c),
      };
    }
    setDrafts(d);
  }, [sessions]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["settings-sessions", yeshivaId] });

  const saveSession = useMutation({
    mutationFn: async (id: string) => {
      const d = drafts[id];
      if (!d) throw new Error("no-draft");
      if (!d.name.trim()) throw new Error("name");
      const err = validateThresholds(d.start_time, d.late_time_b, d.late_time_c);
      if (err) throw new Error(err);
      const { error } = await supabase
        .from("study_sessions")
        .update({
          name: d.name.trim(),
          start_time: d.start_time,
          late_time_b: d.late_time_b,
          late_time_c: d.late_time_c,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הסדר נשמר בהצלחה");
      invalidate();
    },
    onError: () => toast.error("שגיאה בשמירת הסדר"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("study_sessions").update({ active }).eq("id", id);
      if (error) throw error;
      return active;
    },
    onSuccess: (active) => {
      toast.success(active ? "הסדר הופעל" : "הסדר הושבת");
      invalidate();
    },
    onError: () => toast.error("שגיאה בעדכון הסטטוס"),
  });

  const reorder = useMutation({
    mutationFn: async ({ a, b }: { a: StudySession; b: StudySession }) => {
      const { error: e1 } = await supabase
        .from("study_sessions")
        .update({ order_index: b.order_index })
        .eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("study_sessions")
        .update({ order_index: a.order_index })
        .eq("id", b.id);
      if (e2) throw e2;
    },
    onSuccess: () => invalidate(),
    onError: () => toast.error("שגיאה בשינוי הסדר"),
  });

  const removeSession = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("study_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הסדר נמחק");
      invalidate();
    },
    onError: () =>
      toast.error("לא ניתן למחוק את הסדר — ייתכן שקיימים דוחות נוכחות המשויכים אליו"),
  });

  const addSession = useMutation({
    mutationFn: async (values: SessionDraft) => {
      const maxOrder = (sessions ?? []).reduce((m, s) => Math.max(m, s.order_index), 0);
      const { error } = await supabase.from("study_sessions").insert({
        yeshiva_id: yeshivaId,
        name: values.name.trim(),
        start_time: values.start_time,
        late_time_b: values.late_time_b,
        late_time_c: values.late_time_c,
        order_index: maxOrder + 1,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הסדר נוסף בהצלחה");
      invalidate();
    },
    onError: () => toast.error("שגיאה בהוספת הסדר"),
  });

  if (isLoading) return <TableSkeleton rows={3} columns={4} />;

  return (
    <SectionCard
      title="סדרי לימוד"
      description="הגדירו שם, שעת התחלה וספי איחור לכל סדר. ניתן להוסיף, לסדר מחדש ולהשבית סדרים."
      icon={Clock}
      actions={<AddSessionDialog onAdd={(v) => addSession.mutateAsync(v)} />}
      contentClassName="space-y-4"
    >
      {(sessions?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Clock}
          title="אין סדרי לימוד"
          description="הוסיפו את סדרי הלימוד של הישיבה כדי לעבד דוחות נוכחות."
        />
      ) : (
        sessions!.map((s, i) => {
          const d = drafts[s.id];
          if (!d) return null;
          const err = validateThresholds(d.start_time, d.late_time_b, d.late_time_c);
          const nameErr = !d.name.trim();
          const dirty =
            d.name !== s.name ||
            d.start_time !== normalizeTime(s.start_time) ||
            d.late_time_b !== normalizeTime(s.late_time_b) ||
            d.late_time_c !== normalizeTime(s.late_time_c);

          return (
            <div
              key={s.id}
              className={cn(
                "rounded-xl border border-border bg-background/50 p-4",
                !s.active && "opacity-70",
              )}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                {/* reorder */}
                <div className="flex flex-row gap-1 lg:flex-col">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={i === 0 || reorder.isPending}
                    onClick={() => reorder.mutate({ a: s, b: sessions![i - 1] })}
                    aria-label="הקדם סדר"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={i === sessions!.length - 1 || reorder.isPending}
                    onClick={() => reorder.mutate({ a: s, b: sessions![i + 1] })}
                    aria-label="אחר סדר"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
                      <Label>שם הסדר</Label>
                      <Input
                        value={d.name}
                        onChange={(e) =>
                          setDrafts({ ...drafts, [s.id]: { ...d, name: e.target.value } })
                        }
                        placeholder="שם הסדר"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>שעת התחלה</Label>
                      <Input
                        type="time"
                        value={d.start_time}
                        onChange={(e) =>
                          setDrafts({ ...drafts, [s.id]: { ...d, start_time: e.target.value } })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>סף מעבר מ-א׳ ל-ב׳</Label>
                      <Input
                        type="time"
                        value={d.late_time_b}
                        onChange={(e) =>
                          setDrafts({ ...drafts, [s.id]: { ...d, late_time_b: e.target.value } })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>סף מעבר מ-ב׳ ל-ג׳</Label>
                      <Input
                        type="time"
                        value={d.late_time_c}
                        onChange={(e) =>
                          setDrafts({ ...drafts, [s.id]: { ...d, late_time_c: e.target.value } })
                        }
                      />
                    </div>
                  </div>

                  {(err || nameErr) && (
                    <p className="text-sm text-destructive">
                      {nameErr ? "יש להזין שם לסדר" : err}
                    </p>
                  )}

                  <SessionTimeline start={d.start_time} b={d.late_time_b} c={d.late_time_c} />
                </div>

                <div className="flex shrink-0 flex-row items-center gap-3 lg:flex-col lg:items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={s.active}
                      onCheckedChange={(v) => toggleActive.mutate({ id: s.id, active: v })}
                    />
                    <span className="text-muted-foreground">{s.active ? "פעיל" : "מושבת"}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => saveSession.mutate(s.id)}
                      disabled={!!err || nameErr || !dirty || saveSession.isPending}
                    >
                      <Save className="h-4 w-4" />
                      שמור
                    </Button>
                    <ConfirmDialog
                      title="מחיקת סדר"
                      description={
                        <>
                          מחיקת הסדר <span className="font-semibold">{s.name}</span> אפשרית רק אם לא
                          קיימים דוחות נוכחות המשויכים אליו. אם ברצונכם להפסיק להשתמש בו מבלי למחוק,
                          עדיף להשבית אותו.
                        </>
                      }
                      confirmText="מחק סדר"
                      destructive
                      onConfirm={() => removeSession.mutateAsync(s.id)}
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          aria-label="מחק סדר"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </SectionCard>
  );
}

function AddSessionDialog({ onAdd }: { onAdd: (v: SessionDraft) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SessionDraft>({
    name: "",
    start_time: "08:00",
    late_time_b: "08:15",
    late_time_c: "08:30",
  });
  const [pending, setPending] = useState(false);

  const thresholdErr = validateThresholds(form.start_time, form.late_time_b, form.late_time_c);
  const nameErr = !form.name.trim();

  async function submit() {
    if (thresholdErr || nameErr) return;
    try {
      setPending(true);
      await onAdd(form);
      setOpen(false);
      setForm({ name: "", start_time: "08:00", late_time_b: "08:15", late_time_c: "08:30" });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        הוסף סדר
      </Button>
      <DialogContent dir="rtl" className="rounded-2xl text-right">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>הוספת סדר לימוד</DialogTitle>
          <DialogDescription>הגדירו שם, שעת התחלה וספי איחור.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>שם הסדר</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="לדוגמה: סדר ד׳"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>שעת התחלה</Label>
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>סף ב׳</Label>
              <Input
                type="time"
                value={form.late_time_b}
                onChange={(e) => setForm({ ...form, late_time_b: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>סף ג׳</Label>
              <Input
                type="time"
                value={form.late_time_c}
                onChange={(e) => setForm({ ...form, late_time_c: e.target.value })}
              />
            </div>
          </div>
          <SessionTimeline start={form.start_time} b={form.late_time_b} c={form.late_time_c} />
          {(thresholdErr || nameErr) && (
            <p className="text-sm text-destructive">
              {nameErr ? "יש להזין שם לסדר" : thresholdErr}
            </p>
          )}
        </div>
        <DialogFooter className="sm:justify-start sm:gap-2 sm:space-x-0">
          <Button onClick={submit} disabled={pending || !!thresholdErr || nameErr}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            הוסף סדר
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================ *
 * String list (event types / treatment types)
 * ================================================================ */

function StringListTab({
  yeshivaId,
  field,
  title,
  description,
  icon,
  defaults,
  addLabel,
  successText,
}: {
  yeshivaId: string;
  field: "event_types" | "treatment_types";
  title: string;
  description: string;
  icon: typeof Tags;
  defaults: string[];
  addLabel: string;
  successText: string;
}) {
  const qc = useQueryClient();
  const { data: row, isLoading } = useAppSettings(yeshivaId);

  const [items, setItems] = useState<string[]>([]);
  const [initialised, setInitialised] = useState(false);
  useEffect(() => {
    if (!initialised && row !== undefined) {
      const val = row?.[field];
      setItems(val && val.length ? [...val] : [...defaults]);
      setInitialised(true);
    }
  }, [row, initialised, field, defaults]);

  const trimmed = items.map((s) => s.trim());
  const hasEmpty = trimmed.some((s) => !s);
  const dupes =
    new Set(trimmed.filter(Boolean)).size !== trimmed.filter(Boolean).length;
  const error = hasEmpty
    ? "לא ניתן לשמור פריטים ריקים"
    : dupes
      ? "קיימים ערכים כפולים ברשימה"
      : null;

  const save = useMutation({
    mutationFn: async () => {
      const cleaned = trimmed.filter(Boolean);
      const payload = appSettingsPayload(yeshivaId, row, { [field]: cleaned });
      const { error: e } = await supabase
        .from("app_settings")
        .upsert(payload, { onConflict: "yeshiva_id" });
      if (e) throw e;
    },
    onSuccess: () => {
      toast.success(successText);
      qc.invalidateQueries({ queryKey: ["app-settings", yeshivaId] });
    },
    onError: () => toast.error("שגיאה בשמירת הרשימה"),
  });

  function update(i: number, value: string) {
    setItems(items.map((v, j) => (j === i ? value : v)));
  }
  function remove(i: number) {
    setItems(items.filter((_, j) => j !== i));
  }
  function move(i: number, dir: "up" | "down") {
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  }

  if (isLoading) return <TableSkeleton rows={5} columns={2} />;

  return (
    <SectionCard
      title={title}
      description={description}
      icon={icon}
      actions={
        <Button size="sm" onClick={() => save.mutate()} disabled={!!error || save.isPending}>
          <Save className="h-4 w-4" />
          שמור
        </Button>
      }
      contentClassName="space-y-3"
    >
      {items.length === 0 ? (
        <EmptyState
          icon={icon}
          title="הרשימה ריקה"
          description="הוסיפו פריט אחד לפחות."
          action={
            <Button size="sm" variant="outline" onClick={() => setItems([...items, ""])}>
              <Plus className="h-4 w-4" />
              {addLabel}
            </Button>
          }
        />
      ) : (
        <>
          <div className="space-y-2">
            {items.map((value, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={i === 0}
                    onClick={() => move(i, "up")}
                    aria-label="הזז למעלה"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={i === items.length - 1}
                    onClick={() => move(i, "down")}
                    aria-label="הזז למטה"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Input
                  value={value}
                  onChange={(e) => update(i, e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => remove(i)}
                  aria-label="הסר"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setItems([...items, ""])}>
            <Plus className="h-4 w-4" />
            {addLabel}
          </Button>
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </SectionCard>
  );
}

/* ================================================================ *
 * Alert rules
 * ================================================================ */

type RawAlertRule = Record<string, unknown>;
interface NormalizedRule {
  key: string;
  label: string;
  description?: string;
  thresholdLabel?: string;
  windowLabel?: string;
  defaultEnabled: boolean;
  defaultSeverity: Severity;
  defaultThreshold: number | null;
  defaultWindowDays: number | null;
  usesThreshold: boolean;
  usesWindow: boolean;
}

function asStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function asBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function normalizeRule(raw: RawAlertRule, i: number): NormalizedRule {
  const key = asStr(raw.key) ?? asStr(raw.rule_key) ?? asStr(raw.id) ?? `rule_${i}`;
  const label = asStr(raw.label) ?? asStr(raw.title) ?? asStr(raw.name) ?? key;
  const description =
    asStr(raw.description) ?? asStr(raw.help) ?? asStr(raw.hint) ?? asStr(raw.explanation);
  const sev = asStr(raw.defaultSeverity) ?? asStr(raw.severity);
  const defaultSeverity: Severity =
    sev && sev in severityLabels ? (sev as Severity) : "medium";
  const dThreshold = asNum(raw.defaultThreshold) ?? asNum(raw.threshold);
  const dWindow =
    asNum(raw.defaultWindow) ??
    asNum(raw.defaultWindowDays) ??
    asNum(raw.windowDays) ??
    asNum(raw.window_days);

  // The rule catalogue exposes explicit Hebrew field labels; when the label
  // field is present but null, that is the authoritative signal that the rule
  // has no threshold / window input.
  const hasThresholdLabelField = "thresholdLabel" in raw || "threshold_label" in raw;
  const thresholdLabel = asStr(raw.thresholdLabel) ?? asStr(raw.threshold_label);
  const hasWindowLabelField = "windowLabel" in raw || "window_label" in raw;
  const windowLabel = asStr(raw.windowLabel) ?? asStr(raw.window_label);

  return {
    key,
    label,
    description,
    thresholdLabel,
    windowLabel,
    defaultEnabled: asBool(raw.defaultEnabled) ?? asBool(raw.enabled) ?? true,
    defaultSeverity,
    defaultThreshold: dThreshold ?? null,
    defaultWindowDays: dWindow ?? null,
    usesThreshold:
      asBool(raw.usesThreshold) ??
      asBool(raw.hasThreshold) ??
      (hasThresholdLabelField ? thresholdLabel !== undefined : dThreshold !== undefined),
    usesWindow:
      asBool(raw.usesWindow) ??
      asBool(raw.hasWindow) ??
      (hasWindowLabelField ? windowLabel !== undefined : dWindow !== undefined),
  };
}

const NORMALIZED_RULES: NormalizedRule[] = Array.isArray(alertRuleDescriptors)
  ? (alertRuleDescriptors as unknown as RawAlertRule[]).map(normalizeRule)
  : [];

interface RuleDraft {
  enabled: boolean;
  threshold: string;
  window_days: string;
  severity: Severity;
}

function AlertRulesTab({ yeshivaId }: { yeshivaId: string }) {
  const qc = useQueryClient();
  const { data: rows, isLoading } = useQuery({
    queryKey: ["alert-rules", yeshivaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alert_rules")
        .select("*")
        .eq("yeshiva_id", yeshivaId);
      if (error) throw error;
      return (data ?? []) as Tables<"alert_rules">[];
    },
  });

  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({});
  const [initialised, setInitialised] = useState(false);
  useEffect(() => {
    if (initialised || rows === undefined) return;
    const byKey = new Map(rows.map((r) => [r.rule_key, r]));
    const next: Record<string, RuleDraft> = {};
    for (const rule of NORMALIZED_RULES) {
      const existing = byKey.get(rule.key);
      next[rule.key] = {
        enabled: existing?.enabled ?? rule.defaultEnabled,
        threshold:
          existing?.threshold != null
            ? String(existing.threshold)
            : rule.defaultThreshold != null
              ? String(rule.defaultThreshold)
              : "",
        window_days:
          existing?.window_days != null
            ? String(existing.window_days)
            : rule.defaultWindowDays != null
              ? String(rule.defaultWindowDays)
              : "",
        severity: (existing?.severity as Severity | undefined) ?? rule.defaultSeverity,
      };
    }
    setDrafts(next);
    setInitialised(true);
  }, [rows, initialised]);

  const save = useMutation({
    mutationFn: async () => {
      const byKey = new Map((rows ?? []).map((r) => [r.rule_key, r]));
      for (const rule of NORMALIZED_RULES) {
        const d = drafts[rule.key];
        if (!d) continue;
        const threshold = rule.usesThreshold && d.threshold.trim() !== "" ? Number(d.threshold) : null;
        const windowDays =
          rule.usesWindow && d.window_days.trim() !== "" ? Number(d.window_days) : null;
        const existing = byKey.get(rule.key);
        if (existing) {
          const { error } = await supabase
            .from("alert_rules")
            .update({
              enabled: d.enabled,
              severity: d.severity,
              threshold,
              window_days: windowDays,
            })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("alert_rules").insert({
            yeshiva_id: yeshivaId,
            rule_key: rule.key,
            enabled: d.enabled,
            severity: d.severity,
            threshold,
            window_days: windowDays,
          });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success("כללי ההתראה נשמרו");
      qc.invalidateQueries({ queryKey: ["alert-rules", yeshivaId] });
    },
    onError: () => toast.error("שגיאה בשמירת כללי ההתראה"),
  });

  if (isLoading) return <TableSkeleton rows={5} columns={4} />;

  if (NORMALIZED_RULES.length === 0) {
    return (
      <SectionCard title="ספי התראות" icon={BellRing}>
        <EmptyState
          icon={BellRing}
          title="לא הוגדרו כללי התראה"
          description="מנוע ההתראות אינו מגדיר כללים כרגע."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="ספי התראות"
      description="קבעו אילו התראות פעילות, את הסף, חלון הימים ורמת החומרה שלהן."
      icon={BellRing}
      actions={
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="h-4 w-4" />
          שמור התראות
        </Button>
      }
      contentClassName="space-y-3"
    >
      {NORMALIZED_RULES.map((rule) => {
        const d = drafts[rule.key];
        if (!d) return null;
        return (
          <div
            key={rule.key}
            className="rounded-xl border border-border bg-background/50 p-4"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <Switch
                  checked={d.enabled}
                  onCheckedChange={(v) =>
                    setDrafts({ ...drafts, [rule.key]: { ...d, enabled: v } })
                  }
                  className="mt-1"
                />
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{rule.label}</p>
                  {rule.description && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{rule.description}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                {rule.usesThreshold && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{rule.thresholdLabel ?? "סף"}</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-9 w-28"
                      value={d.threshold}
                      onChange={(e) =>
                        setDrafts({ ...drafts, [rule.key]: { ...d, threshold: e.target.value } })
                      }
                    />
                  </div>
                )}
                {rule.usesWindow && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{rule.windowLabel ?? "חלון (ימים)"}</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-9 w-28"
                      value={d.window_days}
                      onChange={(e) =>
                        setDrafts({
                          ...drafts,
                          [rule.key]: { ...d, window_days: e.target.value },
                        })
                      }
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">חומרה</Label>
                  <Select
                    value={d.severity}
                    onValueChange={(v) =>
                      setDrafts({ ...drafts, [rule.key]: { ...d, severity: v as Severity } })
                    }
                  >
                    <SelectTrigger className="h-9 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(severityLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </SectionCard>
  );
}

/* ================================================================ *
 * Active school year
 * ================================================================ */

function SchoolYearTab({ yeshivaId }: { yeshivaId: string }) {
  const qc = useQueryClient();
  const { data: row, isLoading } = useAppSettings(yeshivaId);
  const [value, setValue] = useState("");
  const [initialised, setInitialised] = useState(false);
  useEffect(() => {
    if (!initialised && row !== undefined) {
      setValue(row?.active_school_year ?? "");
      setInitialised(true);
    }
  }, [row, initialised]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = appSettingsPayload(yeshivaId, row, {
        active_school_year: value.trim() || null,
      });
      const { error } = await supabase
        .from("app_settings")
        .upsert(payload, { onConflict: "yeshiva_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("שנת הלימודים נשמרה");
      qc.invalidateQueries({ queryKey: ["app-settings", yeshivaId] });
    },
    onError: () => toast.error("שגיאה בשמירת שנת הלימודים"),
  });

  if (isLoading) return <TableSkeleton rows={2} columns={2} />;

  return (
    <SectionCard
      title="שנת לימודים פעילה"
      description="השנה המוצגת כברירת מחדל בדוחות ובניתוחים."
      icon={CalendarDays}
      actions={
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="h-4 w-4" />
          שמור
        </Button>
      }
    >
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="school-year">שנת הלימודים</Label>
        <Input
          id="school-year"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="לדוגמה: תשפ״ו"
        />
      </div>
    </SectionCard>
  );
}

/* ================================================================ *
 * Yeshiva details
 * ================================================================ */

const yeshivaSchema = z.object({
  name: z.string().trim().min(1, "יש להזין שם ישיבה").max(120, "שם ארוך מדי"),
  address: z.string().trim().max(200, "כתובת ארוכה מדי").optional(),
});

function YeshivaDetailsTab({ yeshivaId }: { yeshivaId: string }) {
  const qc = useQueryClient();
  const { data: yeshiva, isLoading } = useQuery({
    queryKey: ["yeshiva", yeshivaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("yeshivas")
        .select("*")
        .eq("id", yeshivaId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({ name: "", address: "" });
  const [initialised, setInitialised] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!initialised && yeshiva !== undefined) {
      setForm({ name: yeshiva?.name ?? "", address: yeshiva?.address ?? "" });
      setInitialised(true);
    }
  }, [yeshiva, initialised]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = yeshivaSchema.safeParse(form);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? "נתונים לא תקינים";
        setError(msg);
        throw new Error(msg);
      }
      setError(null);
      const { error: e } = await supabase
        .from("yeshivas")
        .update({ name: parsed.data.name, address: parsed.data.address || null })
        .eq("id", yeshivaId);
      if (e) throw e;
    },
    onSuccess: () => {
      toast.success("פרטי הישיבה נשמרו");
      qc.invalidateQueries({ queryKey: ["yeshiva", yeshivaId] });
    },
    onError: (e) => {
      if (e instanceof Error && e.message === error) return;
      toast.error("שגיאה בשמירת פרטי הישיבה");
    },
  });

  if (isLoading) return <TableSkeleton rows={2} columns={2} />;

  return (
    <SectionCard
      title="פרטי הישיבה"
      description="שם הישיבה וכתובתה כפי שיוצגו במערכת."
      icon={Building2}
      actions={
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="h-4 w-4" />
          שמור
        </Button>
      }
      contentClassName="space-y-4"
    >
      <div className="max-w-md space-y-1.5">
        <Label htmlFor="yeshiva-name">שם הישיבה</Label>
        <Input
          id="yeshiva-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className="max-w-md space-y-1.5">
        <Label htmlFor="yeshiva-address">כתובת</Label>
        <Input
          id="yeshiva-address"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </SectionCard>
  );
}
