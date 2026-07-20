import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { studentStatusLabels, type StudentStatus } from "@/lib/hebrew";

export const Route = createFileRoute("/_authenticated/students/")({
  component: StudentsPage,
});

function StudentsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: profileData } = useProfile(user?.id);
  const yeshivaId = profileData?.profile?.yeshiva_id;

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);

  const { data: classes } = useQuery({
    queryKey: ["classes-list", yeshivaId],
    enabled: !!yeshivaId,
    queryFn: async () => (await supabase.from("classes").select("id, name")).data ?? [],
  });

  const { data: students } = useQuery({
    queryKey: ["students", yeshivaId, search, classFilter],
    enabled: !!yeshivaId,
    queryFn: async () => {
      let q = supabase.from("students").select("*, classes(name)").order("full_name");
      if (search) q = q.ilike("full_name", `%${search}%`);
      if (classFilter !== "all") q = q.eq("class_id", classFilter);
      const { data } = await q;
      return data ?? [];
    },
  });

  const [form, setForm] = useState({
    full_name: "",
    father_name: "",
    class_id: "",
    phone: "",
    parent_phone: "",
  });
  const addStudent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("students").insert({
        yeshiva_id: yeshivaId!,
        full_name: form.full_name,
        father_name: form.father_name || null,
        class_id: form.class_id || null,
        phone: form.phone || null,
        parent_phone: form.parent_phone || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ full_name: "", father_name: "", class_id: "", phone: "", parent_phone: "" });
      setShowAdd(false);
      qc.invalidateQueries({ queryKey: ["students"] });
    },
  });

  return (
    <div>
      <PageHeader
        title="רשימת בחורים"
        subtitle={`${students?.length ?? 0} רשומים`}
        actions={
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm"
          >
            + הוסף בחור
          </button>
        }
      />

      {showAdd && (
        <div className="bg-card border border-border rounded-xl p-5 mb-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input placeholder="שם מלא *" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="rounded-md border border-input px-3 py-2 bg-background" />
            <input placeholder="שם האב" value={form.father_name} onChange={(e) => setForm({ ...form, father_name: e.target.value })} className="rounded-md border border-input px-3 py-2 bg-background" />
            <select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} className="rounded-md border border-input px-3 py-2 bg-background">
              <option value="">בחר שיעור...</option>
              {classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input placeholder="טלפון" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-md border border-input px-3 py-2 bg-background" />
            <input placeholder="טלפון הורים" value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} className="rounded-md border border-input px-3 py-2 bg-background" />
            <button
              onClick={() => form.full_name.trim() && addStudent.mutate()}
              disabled={addStudent.isPending}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2"
            >
              שמור
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם..."
          className="flex-1 max-w-sm rounded-md border border-input px-3 py-2 bg-background"
        />
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="rounded-md border border-input px-3 py-2 bg-background"
        >
          <option value="all">כל השיעורים</option>
          {classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-right px-4 py-3 font-medium">שם</th>
              <th className="text-right px-4 py-3 font-medium">שם האב</th>
              <th className="text-right px-4 py-3 font-medium">שיעור</th>
              <th className="text-right px-4 py-3 font-medium">טלפון</th>
              <th className="text-right px-4 py-3 font-medium">סטטוס</th>
              <th className="text-right px-4 py-3 font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {students?.map((s) => (
              <tr key={s.id} className="border-t border-border hover:bg-muted/40">
                <td className="px-4 py-3 font-medium">{s.full_name}</td>
                <td className="px-4 py-3">{s.father_name ?? "—"}</td>
                <td className="px-4 py-3">{(s.classes as { name: string } | null)?.name ?? "—"}</td>
                <td className="px-4 py-3" dir="ltr">{s.phone ?? "—"}</td>
                <td className="px-4 py-3">{studentStatusLabels[s.status as StudentStatus]}</td>
                <td className="px-4 py-3">
                  <Link to="/students/$id" params={{ id: s.id }} className="text-primary text-sm">
                    פתח כרטיס ←
                  </Link>
                </td>
              </tr>
            ))}
            {students && !students.length && (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">אין בחורים להצגה</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}