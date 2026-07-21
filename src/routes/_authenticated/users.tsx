import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  UserCog,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Mail,
  Link2,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { roleLabels, formatHebrewDate, type Role } from "@/lib/hebrew";
import { SectionCard, EmptyState, ConfirmDialog, TableSkeleton } from "@/components/kit";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

const INVITE_DAYS = 14;
const rolePriority: Record<Role, number> = { admin: 0, staff: 1, viewer: 2 };
const roleBadgeClass: Record<Role, string> = {
  admin: "badge-teal",
  staff: "badge-blue",
  viewer: "badge-grey",
};

interface MemberRow {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  role: Role | null;
}

function genToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function inviteLink(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/auth?invite=${token}`;
}

function UsersPage() {
  const { user } = useAuth();
  const { data: profileData, isLoading: profileLoading } = useProfile(user?.id);
  const yeshivaId = profileData?.profile?.yeshiva_id ?? undefined;
  const isAdmin = profileData?.isAdmin ?? false;

  if (profileLoading) {
    return (
      <div>
        <PageHeader title="ניהול משתמשים" subtitle="הזמנת משתמשים וניהול הרשאות" />
        <TableSkeleton rows={5} columns={4} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="ניהול משתמשים" subtitle="הזמנת משתמשים וניהול הרשאות" />
        <EmptyState
          icon={ShieldAlert}
          title="אין הרשאה"
          description="דף זה זמין למנהלי מערכת בלבד. פנו למנהל הישיבה כדי לקבל הרשאות."
        />
      </div>
    );
  }

  return <UsersAdmin yeshivaId={yeshivaId!} currentUserId={user!.id} />;
}

function UsersAdmin({ yeshivaId, currentUserId }: { yeshivaId: string; currentUserId: string }) {
  const qc = useQueryClient();

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ["yeshiva-members", yeshivaId],
    queryFn: async () => {
      const [{ data: profiles, error: pe }, { data: roles, error: re }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, created_at")
          .eq("yeshiva_id", yeshivaId),
        supabase.from("user_roles").select("user_id, role").eq("yeshiva_id", yeshivaId),
      ]);
      if (pe) throw pe;
      if (re) throw re;

      const roleByUser = new Map<string, Role>();
      for (const r of roles ?? []) {
        const role = r.role as Role;
        const existing = roleByUser.get(r.user_id);
        if (!existing || rolePriority[role] < rolePriority[existing]) {
          roleByUser.set(r.user_id, role);
        }
      }
      return (profiles ?? []).map<MemberRow>((p) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        created_at: p.created_at,
        role: roleByUser.get(p.id) ?? null,
      }));
    },
  });

  const { data: invites, isLoading: invitesLoading } = useQuery({
    queryKey: ["yeshiva-invites", yeshivaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("yeshiva_invites")
        .select("*")
        .eq("yeshiva_id", yeshivaId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const adminCount = members?.filter((m) => m.role === "admin").length ?? 0;

  /* ---- invite dialog ---- */
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("staff");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [linkInvite, setLinkInvite] = useState<{ token: string; email: string } | null>(null);

  const createInvite = useMutation({
    mutationFn: async () => {
      const parsed = z
        .object({ email: z.string().trim().email("כתובת אימייל לא תקינה") })
        .safeParse({ email: inviteEmail });
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? "נתונים לא תקינים";
        setInviteError(msg);
        throw new Error(msg);
      }
      setInviteError(null);
      const token = genToken();
      const expires_at = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("yeshiva_invites").insert({
        yeshiva_id: yeshivaId,
        email: parsed.data.email.toLowerCase(),
        role: inviteRole,
        token,
        expires_at,
        created_by: currentUserId,
      });
      if (error) throw error;
      return { token, email: parsed.data.email.toLowerCase() };
    },
    onSuccess: (res) => {
      toast.success("ההזמנה נוצרה");
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("staff");
      setLinkInvite(res);
      qc.invalidateQueries({ queryKey: ["yeshiva-invites", yeshivaId] });
    },
    onError: (e) => {
      if (e instanceof Error && e.message === inviteError) return;
      toast.error("שגיאה ביצירת ההזמנה");
    },
  });

  const resendInvite = useMutation({
    mutationFn: async (inv: { id: string; token: string; email: string }) => {
      const expires_at = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("yeshiva_invites")
        .update({ expires_at })
        .eq("id", inv.id);
      if (error) throw error;
      return { token: inv.token, email: inv.email };
    },
    onSuccess: (res) => {
      toast.success("תוקף ההזמנה חודש");
      setLinkInvite(res);
      qc.invalidateQueries({ queryKey: ["yeshiva-invites", yeshivaId] });
    },
    onError: () => toast.error("שגיאה בחידוש ההזמנה"),
  });

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("yeshiva_invites").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ההזמנה בוטלה");
      qc.invalidateQueries({ queryKey: ["yeshiva-invites", yeshivaId] });
    },
    onError: () => toast.error("שגיאה בביטול ההזמנה"),
  });

  const changeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      const { error: de } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("yeshiva_id", yeshivaId);
      if (de) throw de;
      const { error: ie } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, yeshiva_id: yeshivaId, role });
      if (ie) throw ie;
    },
    onSuccess: () => {
      toast.success("התפקיד עודכן");
      qc.invalidateQueries({ queryKey: ["yeshiva-members", yeshivaId] });
    },
    onError: () => toast.error("שגיאה בעדכון התפקיד"),
  });

  const removeUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error: re } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("yeshiva_id", yeshivaId);
      if (re) throw re;
      const { error: pe } = await supabase
        .from("profiles")
        .update({ yeshiva_id: null })
        .eq("id", userId)
        .eq("yeshiva_id", yeshivaId);
      if (pe) throw pe;
    },
    onSuccess: () => {
      toast.success("המשתמש הוסר מהישיבה");
      qc.invalidateQueries({ queryKey: ["yeshiva-members", yeshivaId] });
    },
    onError: () => toast.error("שגיאה בהסרת המשתמש"),
  });

  return (
    <div>
      <PageHeader
        title="ניהול משתמשים"
        subtitle="הזמינו אנשי צוות לישיבה ונהלו את הרשאותיהם"
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" />
            הזמן משתמש
          </Button>
        }
      />

      {/* Members */}
      <SectionCard
        title="משתמשי הישיבה"
        description={`${members?.length ?? 0} משתמשים`}
        icon={UserCog}
        className="mb-6"
        noPadding
      >
        {membersLoading ? (
          <div className="p-4">
            <TableSkeleton rows={4} columns={4} />
          </div>
        ) : (members?.length ?? 0) === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={UsersIcon}
              title="אין משתמשים"
              description="הזמינו אנשי צוות כדי שיוכלו לגשת למערכת."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="bg-muted/70 px-3 py-2.5 text-start text-xs font-semibold text-muted-foreground">
                    שם
                  </th>
                  <th className="bg-muted/70 px-3 py-2.5 text-start text-xs font-semibold text-muted-foreground">
                    אימייל
                  </th>
                  <th className="bg-muted/70 px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">
                    תפקיד
                  </th>
                  <th className="bg-muted/70 px-3 py-2.5 text-start text-xs font-semibold text-muted-foreground">
                    הצטרף
                  </th>
                  <th className="bg-muted/70 px-3 py-2.5 text-end text-xs font-semibold text-muted-foreground">
                    פעולות
                  </th>
                </tr>
              </thead>
              <tbody>
                {members!.map((m, i) => {
                  const isSelf = m.id === currentUserId;
                  const isLastAdmin = m.role === "admin" && adminCount <= 1;
                  return (
                    <tr
                      key={m.id}
                      className={cn(
                        "border-b border-border/70 last:border-0",
                        i % 2 === 1 && "bg-muted/25",
                      )}
                    >
                      <td className="px-3 py-2.5 font-medium text-foreground">
                        {m.full_name || "—"}
                        {isSelf && <span className="mr-1 text-xs text-muted-foreground">(את/ה)</span>}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground" dir="ltr">
                        {m.email || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {m.role ? (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                              roleBadgeClass[m.role],
                            )}
                          >
                            {roleLabels[m.role]}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">ללא תפקיד</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {formatHebrewDate(m.created_at)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <ChangeRoleDialog
                            member={m}
                            disabled={isLastAdmin}
                            disabledReason={
                              isLastAdmin ? "לא ניתן לשנות את התפקיד של המנהל היחיד" : undefined
                            }
                            onConfirm={(role) => changeRole.mutateAsync({ userId: m.id, role })}
                          />
                          <ConfirmDialog
                            title="הסרת משתמש"
                            description={
                              <>
                                האם להסיר את{" "}
                                <span className="font-semibold">{m.full_name || m.email}</span>{" "}
                                מהישיבה? המשתמש יאבד גישה לכל נתוני הישיבה. ניתן להזמינו מחדש בהמשך.
                              </>
                            }
                            confirmText="הסר מהישיבה"
                            destructive
                            disabled={isSelf || isLastAdmin}
                            onConfirm={() => removeUser.mutateAsync(m.id)}
                            trigger={
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={isSelf || isLastAdmin}
                              >
                                <Trash2 className="h-4 w-4" />
                                הסר
                              </Button>
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Pending invites */}
      <SectionCard
        title="הזמנות ממתינות"
        description="הזמנות שטרם מומשו"
        icon={Mail}
        className="mb-6"
        noPadding
      >
        {invitesLoading ? (
          <div className="p-4">
            <TableSkeleton rows={2} columns={4} />
          </div>
        ) : (invites?.length ?? 0) === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Mail}
              title="אין הזמנות ממתינות"
              description="כל ההזמנות מומשו או שטרם נשלחו הזמנות."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="bg-muted/70 px-3 py-2.5 text-start text-xs font-semibold text-muted-foreground">
                    אימייל
                  </th>
                  <th className="bg-muted/70 px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">
                    תפקיד
                  </th>
                  <th className="bg-muted/70 px-3 py-2.5 text-start text-xs font-semibold text-muted-foreground">
                    בתוקף עד
                  </th>
                  <th className="bg-muted/70 px-3 py-2.5 text-end text-xs font-semibold text-muted-foreground">
                    פעולות
                  </th>
                </tr>
              </thead>
              <tbody>
                {invites!.map((inv, i) => {
                  const expired = new Date(inv.expires_at).getTime() < Date.now();
                  const role = inv.role as Role;
                  return (
                    <tr
                      key={inv.id}
                      className={cn(
                        "border-b border-border/70 last:border-0",
                        i % 2 === 1 && "bg-muted/25",
                      )}
                    >
                      <td className="px-3 py-2.5 font-medium text-foreground" dir="ltr">
                        {inv.email}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            roleBadgeClass[role] ?? "badge-grey",
                          )}
                        >
                          {roleLabels[role] ?? role}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            expired ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {formatHebrewDate(inv.expires_at)}
                          {expired && (
                            <span className="rounded-full badge-red px-2 py-0.5 text-[11px] font-semibold">
                              פג תוקף
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setLinkInvite({ token: inv.token, email: inv.email })
                            }
                          >
                            <Link2 className="h-4 w-4" />
                            קישור
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              resendInvite.mutate({
                                id: inv.id,
                                token: inv.token,
                                email: inv.email,
                              })
                            }
                            disabled={resendInvite.isPending}
                          >
                            <RefreshCw className="h-4 w-4" />
                            חדש תוקף
                          </Button>
                          <ConfirmDialog
                            title="ביטול הזמנה"
                            description={
                              <>
                                לבטל את ההזמנה עבור{" "}
                                <span className="font-semibold">{inv.email}</span>? הקישור הקיים
                                יפסיק לעבוד.
                              </>
                            }
                            confirmText="בטל הזמנה"
                            destructive
                            onConfirm={() => revokeInvite.mutateAsync(inv.id)}
                            trigger={
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                                בטל
                              </Button>
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Roles explanation */}
      <SectionCard title="הסבר על התפקידים" icon={ShieldCheck} contentClassName="space-y-3">
        <RoleExplain
          icon={<ShieldCheck className="h-5 w-5" />}
          title={roleLabels.admin}
          text="גישה מלאה — ניהול משתמשים, הגדרות, בחורים, נוכחות ודוחות."
        />
        <RoleExplain
          icon={<UserCog className="h-5 w-5" />}
          title={roleLabels.staff}
          text="צפייה בבחורים שהוגדרו עבורו, הוספת הערות, אירועים וטיפולים."
        />
        <RoleExplain
          icon={<Eye className="h-5 w-5" />}
          title={roleLabels.viewer}
          text="צפייה בלבד — ללא אפשרות לערוך נתונים."
        />
      </SectionCard>

      {/* Invite create dialog */}
      <Dialog open={inviteOpen} onOpenChange={(v) => !createInvite.isPending && setInviteOpen(v)}>
        <DialogContent dir="rtl" className="rounded-2xl text-right">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>הזמנת משתמש</DialogTitle>
            <DialogDescription>
              צרו הזמנה עבור איש צוות. לאחר היצירה יוצג קישור להעתקה.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">כתובת אימייל</Label>
              <Input
                id="invite-email"
                type="email"
                dir="ltr"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@example.com"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>תפקיד</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(roleLabels) as Role[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabels[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
          </div>
          <DialogFooter className="sm:justify-start sm:gap-2 sm:space-x-0">
            <Button onClick={() => createInvite.mutate()} disabled={createInvite.isPending}>
              {createInvite.isPending ? "יוצר..." : "צור הזמנה"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setInviteOpen(false)}
              disabled={createInvite.isPending}
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite link dialog */}
      <InviteLinkDialog invite={linkInvite} onClose={() => setLinkInvite(null)} />
    </div>
  );
}

function RoleExplain({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-background/50 p-3">
      <div
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary"
        style={{ backgroundColor: "color-mix(in oklch, var(--primary) 12%, transparent)" }}
      >
        {icon}
      </div>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

function ChangeRoleDialog({
  member,
  disabled,
  disabledReason,
  onConfirm,
}: {
  member: MemberRow;
  disabled?: boolean;
  disabledReason?: string;
  onConfirm: (role: Role) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(member.role ?? "staff");
  const [pending, setPending] = useState(false);

  function openDialog() {
    if (disabled) {
      if (disabledReason) toast.error(disabledReason);
      return;
    }
    setRole(member.role ?? "staff");
    setOpen(true);
  }

  async function submit() {
    try {
      setPending(true);
      await onConfirm(role);
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={openDialog} disabled={disabled}>
        <UserCog className="h-4 w-4" />
        תפקיד
      </Button>
      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <DialogContent dir="rtl" className="rounded-2xl text-right">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>שינוי תפקיד</DialogTitle>
            <DialogDescription>
              עדכון התפקיד של {member.full_name || member.email}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>תפקיד</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(roleLabels) as Role[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {roleLabels[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="sm:justify-start sm:gap-2 sm:space-x-0">
            <Button onClick={submit} disabled={pending || role === member.role}>
              {pending ? "מעדכן..." : "אשר שינוי"}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InviteLinkDialog({
  invite,
  onClose,
}: {
  invite: { token: string; email: string } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const link = invite ? inviteLink(invite.token) : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("הקישור הועתק");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("לא ניתן להעתיק — העתיקו ידנית");
    }
  }

  return (
    <Dialog open={!!invite} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="rounded-2xl text-right">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>קישור ההזמנה</DialogTitle>
          <DialogDescription>
            שלחו את הקישור אל <span className="font-semibold" dir="ltr">{invite?.email}</span>. עליו
            להירשם למערכת עם כתובת אימייל זו, והוא יצורף לישיבה באופן אוטומטי עם התפקיד שהוגדר.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <div className="flex items-center gap-2">
            <Input value={link} readOnly dir="ltr" className="flex-1 font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={copy} aria-label="העתק קישור">
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            הקישור בתוקף למשך {INVITE_DAYS} ימים. ניתן לחדש את התוקף מרשימת ההזמנות הממתינות.
          </p>
        </div>
        <DialogFooter className="sm:justify-start">
          <Button onClick={onClose}>סיום</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
