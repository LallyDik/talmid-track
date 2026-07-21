import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  GraduationCap,
  Plus,
  Pencil,
  Power,
  PowerOff,
  ArrowUp,
  ArrowDown,
  Users,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { StatCard, EmptyState, ConfirmDialog, TableSkeleton } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/classes")({
  component: ClassesPage,
});

type ClassRow = Tables<"classes"> & { students?: { count: number }[] };

const classSchema = z.object({
  name: z.string().trim().min(1, "יש להזין שם שיעור").max(80, "שם ארוך מדי"),
  description: z.string().trim().max(500, "התיאור ארוך מדי").optional(),
});

/* ---------------------------------------------------------------- *
 * Local (per-browser) ordering — the classes table has no order
 * column, so the user's preferred order is persisted to localStorage.
 * ---------------------------------------------------------------- */
function orderKey(yeshivaId: string) {
  return `talmid:class-order:${yeshivaId}`;
}
function loadOrder(yeshivaId?: string): string[] {
  if (!yeshivaId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(orderKey(yeshivaId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function persistOrder(yeshivaId: string, ids: string[]) {
  try {
    window.localStorage.setItem(orderKey(yeshivaId), JSON.stringify(ids));
  } catch {
    /* ignore storage failures */
  }
}

function studentCountOf(c: ClassRow): number {
  return c.students?.[0]?.count ?? 0;
}

function ClassesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: profileData } = useProfile(user?.id);
  const yeshivaId = profileData?.profile?.yeshiva_id ?? undefined;

  const { data: classes, isLoading } = useQuery({
    queryKey: ["classes", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("*, students(count)")
        .eq("yeshiva_id", yeshivaId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });

  const [order, setOrder] = useState<string[]>(() => loadOrder(yeshivaId));
  useEffect(() => {
    setOrder(loadOrder(yeshivaId));
  }, [yeshivaId]);

  const orderedClasses = useMemo(() => {
    if (!classes) return [];
    const pos = new Map(order.map((id, i) => [id, i]));
    return [...classes].sort((a, b) => {
      const pa = pos.has(a.id) ? pos.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const pb = pos.has(b.id) ? pos.get(b.id)! : Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return (a.created_at ?? "").localeCompare(b.created_at ?? "");
    });
  }, [classes, order]);

  function move(id: string, dir: "up" | "down") {
    const ids = orderedClasses.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids);
    if (yeshivaId) persistOrder(yeshivaId, ids);
  }

  /* ---- dialog (add / edit) ---- */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClassRow | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [formError, setFormError] = useState<string | null>(null);

  function openAdd() {
    setEditing(null);
    setForm({ name: "", description: "" });
    setFormError(null);
    setDialogOpen(true);
  }
  function openEdit(c: ClassRow) {
    setEditing(c);
    setForm({ name: c.name, description: c.description ?? "" });
    setFormError(null);
    setDialogOpen(true);
  }

  const saveClass = useMutation({
    mutationFn: async () => {
      const parsed = classSchema.safeParse(form);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? "נתונים לא תקינים";
        setFormError(msg);
        throw new Error(msg);
      }
      setFormError(null);
      const payload = {
        name: parsed.data.name,
        description: parsed.data.description || null,
      };
      if (editing) {
        const { error } = await supabase.from("classes").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("classes")
          .insert({ yeshiva_id: yeshivaId!, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "השיעור עודכן בהצלחה" : "השיעור נוסף בהצלחה");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e) => {
      // Validation errors already surfaced inline; only toast real failures.
      if (e instanceof Error && e.message === formError) return;
      toast.error(editing ? "שגיאה בעדכון השיעור" : "שגיאה בהוספת השיעור");
    },
  });

  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("classes").update({ active }).eq("id", id);
      if (error) throw error;
      return active;
    },
    onSuccess: (active) => {
      toast.success(active ? "השיעור הופעל" : "השיעור הושבת");
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: () => toast.error("שגיאה בעדכון סטטוס השיעור"),
  });

  const total = classes?.length ?? 0;
  const activeCount = classes?.filter((c) => c.active).length ?? 0;
  const studentsTotal = classes?.reduce((sum, c) => sum + studentCountOf(c), 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="ניהול שיעורים"
        subtitle="הוספה, עריכה, סידור והשבתה של שיעורים בישיבה"
        actions={
          <Button onClick={openAdd} disabled={!yeshivaId}>
            <Plus className="h-4 w-4" />
            הוסף שיעור
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="סה״כ שיעורים" value={total} icon={GraduationCap} tone="teal" />
        <StatCard label="שיעורים פעילים" value={activeCount} icon={CheckCircle2} tone="green" />
        <StatCard label="סה״כ בחורים" value={studentsTotal} icon={Users} tone="blue" />
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : orderedClasses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="אין שיעורים עדיין"
          description="הוסיפו את השיעורים בישיבה כדי לשייך אליהם בחורים ולנהל נוכחות."
          action={
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" />
              הוסף שיעור ראשון
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="bg-muted/70 px-3 py-2.5 text-start text-xs font-semibold text-muted-foreground w-24">
                    סדר
                  </th>
                  <th className="bg-muted/70 px-3 py-2.5 text-start text-xs font-semibold text-muted-foreground">
                    שם השיעור
                  </th>
                  <th className="bg-muted/70 px-3 py-2.5 text-start text-xs font-semibold text-muted-foreground">
                    תיאור
                  </th>
                  <th className="bg-muted/70 px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">
                    בחורים
                  </th>
                  <th className="bg-muted/70 px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">
                    סטטוס
                  </th>
                  <th className="bg-muted/70 px-3 py-2.5 text-end text-xs font-semibold text-muted-foreground">
                    פעולות
                  </th>
                </tr>
              </thead>
              <tbody>
                {orderedClasses.map((c, i) => (
                  <tr
                    key={c.id}
                    className={cn(
                      "border-b border-border/70 transition-colors last:border-0",
                      i % 2 === 1 && "bg-muted/25",
                      !c.active && "opacity-60",
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={i === 0}
                          onClick={() => move(c.id, "up")}
                          aria-label="הזז למעלה"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={i === orderedClasses.length - 1}
                          onClick={() => move(c.id, "down")}
                          aria-label="הזז למטה"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{c.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {c.description || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{studentCountOf(c)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          c.active ? "badge-green" : "badge-grey",
                        )}
                      >
                        {c.active ? "פעיל" : "לא פעיל"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="h-4 w-4" />
                          עריכה
                        </Button>
                        {c.active ? (
                          <ConfirmDialog
                            title="השבתת שיעור"
                            description={
                              <>
                                השבתת השיעור <span className="font-semibold">{c.name}</span> תסתיר
                                אותו מרשימות הבחירה. הבחורים המשויכים אליו יישארו במערכת אך יופיעו
                                ללא שיעור פעיל. ניתן להפעיל את השיעור מחדש בכל עת.
                              </>
                            }
                            confirmText="השבת שיעור"
                            destructive
                            onConfirm={async () => {
                              await setActive.mutateAsync({ id: c.id, active: false });
                            }}
                            trigger={
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                <PowerOff className="h-4 w-4" />
                                השבת
                              </Button>
                            }
                          />
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-primary"
                            onClick={() => setActive.mutate({ id: c.id, active: true })}
                          >
                            <Power className="h-4 w-4" />
                            הפעל
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="rounded-2xl text-right">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>{editing ? "עריכת שיעור" : "הוספת שיעור"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "עדכנו את שם השיעור והתיאור."
                : "הזינו את שם השיעור ותיאור אופציונלי."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="class-name">שם השיעור</Label>
              <Input
                id="class-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="לדוגמה: שיעור א׳"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="class-desc">תיאור (אופציונלי)</Label>
              <Textarea
                id="class-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="פרטים נוספים על השיעור, המגיד שיעור וכד׳"
                rows={3}
              />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter className="sm:justify-start sm:gap-2 sm:space-x-0">
            <Button onClick={() => saveClass.mutate()} disabled={saveClass.isPending}>
              {saveClass.isPending ? "שומר..." : "שמור"}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saveClass.isPending}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
