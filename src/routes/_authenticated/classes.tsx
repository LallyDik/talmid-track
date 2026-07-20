import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

export const Route = createFileRoute("/_authenticated/classes")({
  component: ClassesPage,
});

function ClassesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: profileData } = useProfile(user?.id);
  const yeshivaId = profileData?.profile?.yeshiva_id;
  const [name, setName] = useState("");

  const { data: classes } = useQuery({
    queryKey: ["classes", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("*, students(count)")
        .order("created_at");
      return data ?? [];
    },
  });

  const addClass = useMutation({
    mutationFn: async (n: string) => {
      const { error } = await supabase.from("classes").insert({ yeshiva_id: yeshivaId!, name: n });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("classes").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["classes"] }),
  });

  return (
    <div>
      <PageHeader title="ניהול שיעורים" subtitle="הוספה, עריכה והפעלה של שיעורים בישיבה" />
      <div className="bg-card border border-border rounded-xl p-6 mb-6 max-w-xl">
        <h2 className="text-md font-semibold mb-3">הוסף שיעור חדש</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) addClass.mutate(name.trim());
          }}
          className="flex gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="שם השיעור"
            className="flex-1 rounded-md border border-input px-3 py-2 bg-background"
          />
          <button className="rounded-md bg-primary text-primary-foreground px-4 py-2">
            הוסף
          </button>
        </form>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-right px-4 py-3 font-medium">שם השיעור</th>
              <th className="text-right px-4 py-3 font-medium">מס' בחורים</th>
              <th className="text-right px-4 py-3 font-medium">סטטוס</th>
              <th className="text-right px-4 py-3 font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {classes?.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3">{(c.students as { count: number }[])?.[0]?.count ?? 0}</td>
                <td className="px-4 py-3">
                  <span className={c.active ? "text-green-700" : "text-muted-foreground"}>
                    {c.active ? "פעיל" : "לא פעיל"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleActive.mutate({ id: c.id, active: !c.active })}
                    className="text-sm text-primary"
                  >
                    {c.active ? "השבת" : "הפעל"}
                  </button>
                </td>
              </tr>
            ))}
            {(!classes || !classes.length) && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-muted-foreground">
                  אין שיעורים עדיין
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}