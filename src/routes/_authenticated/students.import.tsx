import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowLeft,
  ClipboardPaste,
  FileUp,
  Loader2,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Users,
  ArrowUpFromLine,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { SectionCard, EmptyState } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import {
  parseFile,
  parsePastedText,
  guessColumnMapping,
  reinterpretHeader,
  type ColumnMapping,
  type ParsedSheet,
  type TargetField,
  type ExistingStudent,
} from "@/services/studentListParser";
import { useRosterImport } from "@/components/import/useRosterImport";

export const Route = createFileRoute("/_authenticated/students/import")({
  component: ImportPage,
});

const ALL_SCOPE = "__all__";
const NONE_COL = "__none__";

/** Target fields shown in the mapping UI. Note: there is NO separate father
 *  field — the full name is a single field, stored exactly as written. */
const UI_TARGETS: { field: TargetField; label: string; required?: boolean }[] = [
  { field: "full_name", label: "שם מלא", required: true },
  { field: "class_name", label: "שיעור" },
  { field: "phone", label: "טלפון" },
  { field: "parent_phone", label: "טלפון הורים" },
  { field: "notes", label: "הערות" },
];

const STEPS = ["מקור", "התאמת עמודות", "תצוגה מקדימה", "ייבוא"] as const;

function emptyMapping(): ColumnMapping {
  return {
    full_name: null,
    father_name: null,
    class_name: null,
    phone: null,
    parent_phone: null,
    notes: null,
  };
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {done ? <CheckCircle2 className="h-4 w-4" /> : n}
            </span>
            <span className={cn("font-medium", active ? "text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
            {n < STEPS.length && <span className="mx-1 text-muted-foreground/40">—</span>}
          </li>
        );
      })}
    </ol>
  );
}

function ImportPage() {
  const { user } = useAuth();
  const { data: profileData } = useProfile(user?.id);
  const yeshivaId = profileData?.profile?.yeshiva_id ?? undefined;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [step, setStep] = useState(1);
  const [scope, setScope] = useState<string>(ALL_SCOPE);
  const [sourceMode, setSourceMode] = useState<"paste" | "file">("paste");
  const [pastedText, setPastedText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(emptyMapping());
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  /* ---- data: classes + existing students (for dup detection) ---- */
  const { data: classes = [] } = useQuery({
    queryKey: ["import-classes", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, name")
        .eq("yeshiva_id", yeshivaId!)
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  const { data: existingStudents = [] } = useQuery({
    queryKey: ["import-existing-students", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async (): Promise<ExistingStudent[]> => {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, class_id, classes(name)")
        .eq("yeshiva_id", yeshivaId!)
        .eq("active", true);
      // The name is a single field; there is no separate father concept, so
      // duplicate matching keys purely on normalized full_name (+ class).
      return (data ?? []).map((s) => ({
        id: s.id,
        full_name: s.full_name,
        father_name: null,
        class_name: (s.classes as { name: string } | null)?.name ?? null,
      }));
    },
  });

  const selectedClass = scope === ALL_SCOPE ? null : classes.find((c) => c.id === scope) ?? null;
  const forcedClassName = selectedClass?.name ?? null;

  const knownClasses = useMemo(() => classes.map((c) => ({ id: c.id, name: c.name })), [classes]);

  const roster = useRosterImport({
    sheet,
    mapping,
    knownClasses,
    existingStudents,
    forcedClassName,
  });

  /* ---- parse the chosen source ---- */
  async function handleParse() {
    setParsing(true);
    setParseError(null);
    try {
      let parsed: ParsedSheet;
      if (sourceMode === "paste") {
        if (!pastedText.trim()) {
          setParseError("יש להדביק טקסט לפני שממשיכים.");
          return;
        }
        parsed = parsePastedText(pastedText);
      } else {
        if (!file) {
          setParseError("יש לבחור קובץ לפני שממשיכים.");
          return;
        }
        parsed = await parseFile(file);
      }
      if (parsed.rows.length === 0) {
        setParseError("לא נמצאו שורות נתונים במקור שנבחר.");
        return;
      }
      const guessed = guessColumnMapping(parsed.headers);
      guessed.father_name = null; // never map a father field
      setSheet(parsed);
      setMapping(guessed);
      setStep(2);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "אירעה שגיאה בניתוח המקור.");
    } finally {
      setParsing(false);
    }
  }

  function toggleHeader(hasHeader: boolean) {
    if (!sheet) return;
    const next = reinterpretHeader(sheet, hasHeader);
    const guessed = guessColumnMapping(next.headers);
    guessed.father_name = null;
    setSheet(next);
    setMapping(guessed);
  }

  function setColumn(field: TargetField, value: string) {
    setMapping((prev) => ({ ...prev, [field]: value === NONE_COL ? null : Number(value) }));
  }

  const activeTargets = UI_TARGETS.filter(
    (t) => !(t.field === "class_name" && scope !== ALL_SCOPE),
  );
  const nameMapped = mapping.full_name !== null;

  /* ---- import mutation (chunked insert) ---- */
  const importMut = useMutation({
    mutationFn: async () => {
      if (!yeshivaId) throw new Error("לא נמצא שיוך לישיבה.");
      const plan = roster.buildPlan();
      if (plan.toInsert.length === 0) throw new Error("אין רשומות חדשות לייבוא.");

      const rowsToInsert = plan.toInsert.map((s) => ({
        yeshiva_id: yeshivaId,
        full_name: s.full_name,
        father_name: null as string | null,
        class_id: roster.classNameToId(s.class_name) ?? null,
        phone: s.phone,
        parent_phone: s.parent_phone,
        notes: s.notes,
        active: true,
      }));

      const CHUNK = 200;
      let inserted = 0;
      for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
        const batch = rowsToInsert.slice(i, i + CHUNK);
        const { error } = await supabase.from("students").insert(batch);
        if (error) throw error;
        inserted += batch.length;
      }
      return inserted;
    },
    onSuccess: (inserted) => {
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["student-stats", yeshivaId] });
      toast.success(`${inserted} בחורים יובאו בהצלחה.`);
      navigate({ to: "/students" });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "הייבוא נכשל.");
    },
  });

  if (!yeshivaId) {
    return (
      <div>
        <PageHeader title="ייבוא בחורים" subtitle="ייבוא רשימת בחורים מקובץ או מטקסט מודבק" />
        <EmptyState
          icon={Users}
          title="לא נמצא שיוך לישיבה"
          description="יש להשלים את שלב ההקמה לפני ייבוא בחורים."
        />
      </div>
    );
  }

  const showClassColumn = scope === ALL_SCOPE;

  return (
    <div>
      <PageHeader
        title="ייבוא בחורים"
        subtitle="ייבוא רשימת בחורים מקובץ Excel/CSV או מטקסט מודבק, עם זיהוי כפילויות ובקרת שגיאות."
        actions={
          <Button asChild variant="outline">
            <Link to="/students">
              <ArrowRight className="h-4 w-4" />
              חזרה לרשימה
            </Link>
          </Button>
        }
      />

      <Stepper step={step} />

      {/* ---------------- Step 1: source ---------------- */}
      {step === 1 && (
        <div className="space-y-5">
          <SectionCard title="היקף הייבוא" description="לאיזה שיעור לשייך את הבחורים המיובאים">
            <div className="max-w-sm space-y-1.5">
              <Label>שיוך לשיעור</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value={ALL_SCOPE}>כל הישיבה (לפי עמודת שיעור בקובץ)</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {scope === ALL_SCOPE
                  ? "כל בחור ישויך לשיעור לפי העמודה המתאימה בקובץ (אם קיימת ומזוהה)."
                  : "כל הבחורים בקובץ ישויכו לשיעור שנבחר."}
              </p>
            </div>
          </SectionCard>

          <SectionCard title="מקור הנתונים" description="הדביקו טקסט או בחרו קובץ Excel / CSV">
            <div className="mb-4 inline-flex rounded-lg border border-border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => setSourceMode("paste")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  sourceMode === "paste"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ClipboardPaste className="h-4 w-4" />
                הדבקת טקסט
              </button>
              <button
                type="button"
                onClick={() => setSourceMode("file")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  sourceMode === "file"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <FileUp className="h-4 w-4" />
                קובץ
              </button>
            </div>

            {sourceMode === "paste" ? (
              <div className="space-y-1.5">
                <Label htmlFor="paste-area">הדביקו את רשימת הבחורים</Label>
                <Textarea
                  id="paste-area"
                  dir="rtl"
                  rows={10}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={'ניתן להדביק ישירות מ-Excel או Word. לדוגמה:\nשם מלא, שיעור, טלפון\nוינברג שלום נח ב"ר אברהם, שיעור א, 050-0000000'}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  מזוהה אוטומטית מפריד (טאב / פסיק) וכן שורת כותרת אם קיימת.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="import-file">בחרו קובץ</Label>
                <Input
                  id="import-file"
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx,.xls"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="cursor-pointer file:me-3 file:cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">
                  {file ? file.name : "נתמכים: Excel ‎(.xlsx/.xls)‎ ו-CSV/TSV. קידוד עברי מזוהה אוטומטית."}
                </p>
              </div>
            )}

            {parseError && (
              <p className="mt-3 flex items-start gap-1.5 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{parseError}</span>
              </p>
            )}

            <div className="mt-5 flex justify-start">
              <Button onClick={handleParse} disabled={parsing}>
                {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeft className="h-4 w-4" />}
                נתח והמשך
              </Button>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ---------------- Step 2: mapping ---------------- */}
      {step === 2 && sheet && (
        <div className="space-y-5">
          <SectionCard
            title="התאמת עמודות"
            description="שייכו כל עמודה מהמקור לשדה המתאים. שדה שם מלא הוא חובה."
          >
            <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={sheet.hasHeader}
                onCheckedChange={(v) => toggleHeader(v === true)}
              />
              השורה הראשונה היא כותרת
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {activeTargets.map((t) => (
                <div key={t.field} className="space-y-1.5">
                  <Label>
                    {t.label}
                    {t.required && <span className="ms-1 text-destructive">*</span>}
                  </Label>
                  <Select
                    value={mapping[t.field] === null ? NONE_COL : String(mapping[t.field])}
                    onValueChange={(v) => setColumn(t.field, v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value={NONE_COL}>— לא ממופה —</SelectItem>
                      {sheet.headers.map((h, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {!nameMapped && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                יש למפות עמודה לשדה "שם מלא" כדי להמשיך.
              </p>
            )}
          </SectionCard>

          {/* small raw sample */}
          <SectionCard title="דוגמת נתונים" description={`${sheet.rows.length} שורות זוהו במקור`} noPadding>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {sheet.headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.slice(0, 3).map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 1 ? "bg-muted/25" : undefined}>
                      {sheet.headers.map((_, ci) => (
                        <td key={ci} className="px-3 py-2 text-foreground">
                          {row[ci] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowRight className="h-4 w-4" />
              חזרה
            </Button>
            <Button onClick={() => setStep(3)} disabled={!nameMapped}>
              <ArrowLeft className="h-4 w-4" />
              המשך לתצוגה מקדימה
            </Button>
          </div>
        </div>
      )}

      {/* ---------------- Step 3: preview ---------------- */}
      {step === 3 && sheet && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile label="ייובאו" value={roster.summary.willImport} tone="green" />
            <SummaryTile label="כפילויות" value={roster.summary.duplicates} tone="amber" />
            <SummaryTile label="שגיאות" value={roster.summary.errors} tone="red" />
            <SummaryTile label="ידולגו" value={roster.summary.skipped} tone="grey" />
          </div>

          {showClassColumn && roster.unknownClassNames.length > 0 && (
            <p className="flex items-start gap-1.5 rounded-lg border border-[var(--status-late-b)]/40 bg-[color-mix(in_oklch,var(--status-late-b)_10%,transparent)] px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-late-b)]" />
              <span>
                שיעורים שלא זוהו במערכת: {roster.unknownClassNames.join(", ")}. בחורים אלה ייובאו ללא
                שיוך לשיעור.
              </span>
            </p>
          )}

          <SectionCard
            title="תצוגה מקדימה"
            description="בדקו את השורות. כפילויות מסומנות וניתן לבחור לדלג או לייבא בכל זאת."
            noPadding
          >
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-muted/70 backdrop-blur">
                    <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">#</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">שם מלא</th>
                    {showClassColumn && (
                      <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">שיעור</th>
                    )}
                    <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">טלפון</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">טלפון הורים</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">מצב</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.rows.map((r) => {
                    const hasError = r.errors.length > 0;
                    return (
                      <tr
                        key={r.index}
                        className={cn(
                          "border-b border-border/70",
                          hasError && "bg-[color-mix(in_oklch,var(--status-absent)_8%,transparent)]",
                        )}
                      >
                        <td className="px-3 py-2 text-muted-foreground tabular-nums">{r.index + 1}</td>
                        <td className="px-3 py-2 font-medium text-foreground">
                          {r.values.full_name || <span className="text-destructive">חסר שם</span>}
                        </td>
                        {showClassColumn && (
                          <td className="px-3 py-2 text-muted-foreground">
                            {r.values.class_name || "—"}
                          </td>
                        )}
                        <td className="px-3 py-2 text-muted-foreground" dir="ltr">
                          {r.values.phone || "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground" dir="ltr">
                          {r.values.parent_phone || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <RowStatus
                            error={r.errors[0]}
                            warning={r.warnings[0]}
                            dupLabel={r.duplicate?.matchedLabel ?? null}
                            choice={r.choice}
                            onChoice={(c) => roster.setChoice(r.index, c)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowRight className="h-4 w-4" />
              חזרה למיפוי
            </Button>
            <Button onClick={() => setStep(4)} disabled={roster.summary.willImport === 0}>
              <ArrowLeft className="h-4 w-4" />
              המשך לייבוא
            </Button>
          </div>
        </div>
      )}

      {/* ---------------- Step 4: import ---------------- */}
      {step === 4 && (
        <div className="space-y-5">
          <SectionCard title="אישור וייבוא" icon={ArrowUpFromLine}>
            <p className="text-sm text-muted-foreground">
              עומדים לייבא <strong className="text-foreground">{roster.summary.willImport}</strong> בחורים
              {selectedClass ? (
                <>
                  {" "}
                  לשיעור <strong className="text-foreground">{selectedClass.name}</strong>
                </>
              ) : (
                " לישיבה"
              )}
              .
              {roster.summary.skipped > 0 && ` ${roster.summary.skipped} כפילויות ידולגו.`}
              {roster.summary.errors > 0 && ` ${roster.summary.errors} שורות עם שגיאות לא ייובאו.`}
            </p>

            <div className="mt-5 flex items-center gap-3">
              <Button
                onClick={() => importMut.mutate()}
                disabled={importMut.isPending || roster.summary.willImport === 0}
              >
                {importMut.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    מייבא...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    ייבא {roster.summary.willImport} בחורים
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => setStep(3)} disabled={importMut.isPending}>
                <ArrowRight className="h-4 w-4" />
                חזרה
              </Button>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Small presentational helpers
 * ------------------------------------------------------------------ */

const TONE_VAR: Record<string, string> = {
  green: "var(--status-on-time)",
  amber: "var(--status-late-b)",
  red: "var(--status-absent)",
  grey: "var(--status-unknown)",
};

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  const color = TONE_VAR[tone] ?? "var(--primary)";
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function RowStatus({
  error,
  warning,
  dupLabel,
  choice,
  onChoice,
}: {
  error?: string;
  warning?: string;
  dupLabel: string | null;
  choice: "skip" | "import" | "update";
  onChoice: (c: "skip" | "import") => void;
}) {
  if (error) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" />
        {error}
      </span>
    );
  }

  if (dupLabel) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-[var(--status-late-b)]">כפילות: {dupLabel}</span>
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          <button
            type="button"
            onClick={() => onChoice("skip")}
            className={cn(
              "px-2 py-0.5 text-xs font-medium transition-colors",
              choice === "skip"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            דלג
          </button>
          <button
            type="button"
            onClick={() => onChoice("import")}
            className={cn(
              "px-2 py-0.5 text-xs font-medium transition-colors",
              choice !== "skip"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            ייבא בכל זאת
          </button>
        </div>
      </div>
    );
  }

  if (warning) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--status-late-b)]">
        <AlertTriangle className="h-3.5 w-3.5" />
        {warning}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-[var(--status-on-time)]">
      <CheckCircle2 className="h-3.5 w-3.5" />
      תקין
    </span>
  );
}
