import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

const nav = [
  { to: "/dashboard", label: "לוח בקרה", icon: "◧" },
  { to: "/students", label: "בחורים", icon: "◉" },
  { to: "/classes", label: "שיעורים", icon: "▤" },
  { to: "/attendance/upload", label: "העלאת דוח", icon: "↑" },
  { to: "/attendance/reports", label: "דוחות נוכחות", icon: "≡" },
  { to: "/settings", label: "הגדרות", icon: "⚙" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const { data: profileData } = useProfile(user?.id);
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col shrink-0">
        <div className="px-5 py-6 border-b border-sidebar-border">
          <div className="text-xs opacity-70">מערכת</div>
          <div className="text-lg font-bold">ניהול הישיבה</div>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1">
          {nav.map((n) => {
            const active = pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "hover:bg-sidebar-accent"
                }`}
              >
                <span className="opacity-80">{n.icon}</span>
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border text-sm">
          <div className="opacity-70 text-xs mb-1">מחובר כ</div>
          <div className="truncate mb-2">{profileData?.profile?.email ?? user?.email}</div>
          {profileData?.isAdmin && (
            <div className="text-xs bg-sidebar-primary/30 rounded px-2 py-0.5 inline-block mb-2">
              מנהל
            </div>
          )}
          <button
            onClick={signOut}
            className="w-full mt-1 text-right text-sm opacity-80 hover:opacity-100"
          >
            יציאה
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto">
        <div className="max-w-7xl mx-auto p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}