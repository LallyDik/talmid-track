import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: profileData } = useProfile(user?.id);
  const yeshivaId = profileData?.profile?.yeshiva_id;

  const { data: sessions } = useQuery({
    queryKey: ["sessions-settings", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => (await supabase.from("study_sessions").select("*").order("order_index")).data ?? [],
  });

  const [drafts, setDrafts] = useState<Record<string, { start_time: string; late_time_b: string; late_time_c: string }>>({});

  useEffect(() => {
    if (sessions) {
      const d: typeof drafts = {};
      sessions.forEach((s) => {
        d[s.id] = { start_time: s.start_time, late_time_b: s.late_time_b, late_time_c: s.late_time_c };
      });
      setDrafts(d);
    }
  }, [sessions]);

  const save = useMutation({
    mutationFn: async (id: string) => {
      const d = drafts[id];
      const { error } = await supabase.from("study_sessions").update(d).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions-settings"] }),
  });

  return (
    <div>
      <PageHeader title="הגדרות" subtitle="שעות סדרי הלימוד וספי איחור" />
      <div className="bg-card border border-border rounded-xl overflow-hidden max-w-3xl">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-right px-4 py-3">סדר</th>
              <th className="text-right px-4 py-3">שעת התחלה</th>
              <th className="text-right px-4 py-3">סף ב׳ (איחור)</th>
              <th className="text-right px-4 py-3">סף ג׳ (איחור משמעותי)</th>
              <th className="text-right px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {sessions?.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                {(["start_time", "late_time_b", "late_time_c"] as const).map((f) => (
                  <td key={f} className="px-4 py-3">
                    <input
                      type="time"
                      value={drafts[s.id]?.[f] ?? ""}
                      onChange={(e) => setDrafts({ ...drafts, [s.id]: { ...drafts[s.id], [f]: e.target.value } })}
                      className="rounded-md border border-input px-2 py-1 bg-background"
                    />
                  </td>
                ))}
                <td className="px-4 py-3">
                  <button onClick={() => save.mutate(s.id)} className="text-primary text-sm">שמור</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}