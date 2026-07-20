import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [yeshivaName, setYeshivaName] = useState("");
  const [address, setAddress] = useState("");
  const [classes, setClasses] = useState<string[]>(["שיעור א׳", "שיעור ב׳", "שיעור ג׳"]);
  const [studentsText, setStudentsText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data: y, error: ye } = await supabase
        .from("yeshivas")
        .insert({ name: yeshivaName, address })
        .select()
        .single();
      if (ye) throw ye;

      const { error: pe } = await supabase
        .from("profiles")
        .update({ yeshiva_id: y.id })
        .eq("id", user.id);
      if (pe) throw pe;

      // default study sessions
      await supabase.from("study_sessions").insert([
        { yeshiva_id: y.id, name: "סדר א׳", order_index: 1, start_time: "08:00", late_time_b: "08:15", late_time_c: "08:30" },
        { yeshiva_id: y.id, name: "סדר ב׳", order_index: 2, start_time: "16:00", late_time_b: "16:15", late_time_c: "16:30" },
        { yeshiva_id: y.id, name: "סדר ג׳", order_index: 3, start_time: "20:30", late_time_b: "20:45", late_time_c: "21:00" },
      ]);

      const classNames = classes.filter((c) => c.trim());
      const insertedClasses: { id: string; name: string }[] = [];
      if (classNames.length) {
        const { data: cData, error: ce } = await supabase
          .from("classes")
          .insert(classNames.map((name) => ({ yeshiva_id: y.id, name })))
          .select();
        if (ce) throw ce;
        insertedClasses.push(...(cData ?? []));
      }

      // Parse students text (CSV/paste): full_name, father_name, class_name, phone
      const lines = studentsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length) {
        const rows = lines.map((line) => {
          const parts = line.split(/[,\t]/).map((p) => p.trim());
          const [full_name, father_name, class_name, phone, parent_phone] = parts;
          const cls = insertedClasses.find((c) => c.name === class_name);
          return {
            yeshiva_id: y.id,
            full_name,
            father_name: father_name || null,
            class_id: cls?.id ?? null,
            phone: phone || null,
            parent_phone: parent_phone || null,
          };
        });
        const { error: se } = await supabase.from("students").insert(rows);
        if (se) throw se;
      }

      await qc.invalidateQueries();
      navigate({ to: "/dashboard" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title="אשף קליטה ראשונית" subtitle={`שלב ${step} מתוך 3`} />
      <div className="bg-card border border-border rounded-xl p-6 max-w-3xl">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">פרטי הישיבה</h2>
            <div>
              <label className="block text-sm font-medium mb-1">שם הישיבה</label>
              <input
                value={yeshivaName}
                onChange={(e) => setYeshivaName(e.target.value)}
                className="w-full rounded-md border border-input px-3 py-2 bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">כתובת</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-md border border-input px-3 py-2 bg-background"
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={!yeshivaName.trim()}
                className="rounded-md bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50"
              >
                המשך
              </button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">שיעורים</h2>
            <p className="text-sm text-muted-foreground">הוסף את השיעורים בישיבה</p>
            {classes.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={c}
                  onChange={(e) => {
                    const arr = [...classes];
                    arr[i] = e.target.value;
                    setClasses(arr);
                  }}
                  className="flex-1 rounded-md border border-input px-3 py-2 bg-background"
                />
                <button
                  onClick={() => setClasses(classes.filter((_, j) => j !== i))}
                  className="text-sm text-destructive px-3"
                >
                  הסר
                </button>
              </div>
            ))}
            <button
              onClick={() => setClasses([...classes, ""])}
              className="text-sm text-primary"
            >
              + הוסף שיעור
            </button>
            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="rounded-md border px-4 py-2">
                חזור
              </button>
              <button
                onClick={() => setStep(3)}
                className="rounded-md bg-primary text-primary-foreground px-4 py-2"
              >
                המשך
              </button>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">רשימת בחורים (אופציונלי)</h2>
            <p className="text-sm text-muted-foreground">
              הדבק כל בחור בשורה נפרדת. פורמט: <code>שם מלא, שם האב, שם השיעור, טלפון, טלפון הורים</code>
            </p>
            <textarea
              value={studentsText}
              onChange={(e) => setStudentsText(e.target.value)}
              rows={10}
              placeholder="ישראל ישראלי, יוסף, שיעור א׳, 050-1234567, 03-1234567"
              className="w-full rounded-md border border-input px-3 py-2 bg-background font-mono text-sm"
            />
            {error && <div className="text-sm text-destructive">{error}</div>}
            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="rounded-md border px-4 py-2">
                חזור
              </button>
              <button
                onClick={finish}
                disabled={loading}
                className="rounded-md bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50"
              >
                {loading ? "שומר..." : "סיים והתחל לעבוד"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}