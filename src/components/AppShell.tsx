import { useState, type ComponentType, type ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  GraduationCap,
  Upload,
  FileStack,
  BarChart3,
  ListTodo,
  BellRing,
  UserCog,
  Settings,
  LogOut,
  Menu,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { roleLabels } from "@/lib/hebrew";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type LucideIcon = ComponentType<{ className?: string }>;

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    heading: "ראשי",
    items: [{ to: "/dashboard", label: "לוח בקרה", icon: LayoutDashboard }],
  },
  {
    heading: "בחורים",
    items: [
      { to: "/students", label: "בחורים", icon: Users },
      { to: "/students/import", label: "ייבוא בחורים", icon: UserPlus },
      { to: "/classes", label: "שיעורים", icon: GraduationCap },
    ],
  },
  {
    heading: "נוכחות",
    items: [
      { to: "/attendance/upload", label: "העלאת דוח", icon: Upload },
      { to: "/attendance/reports", label: "דוחות נוכחות", icon: FileStack },
    ],
  },
  {
    heading: "מעקב וניתוח",
    items: [
      { to: "/reports", label: "דוחות וניתוחים", icon: BarChart3 },
      { to: "/tasks", label: "משימות", icon: ListTodo },
      { to: "/alerts", label: "התראות", icon: BellRing },
    ],
  },
  {
    heading: "מערכת",
    items: [
      { to: "/users", label: "משתמשים", icon: UserCog, adminOnly: true },
      { to: "/settings", label: "הגדרות", icon: Settings },
    ],
  },
];

const allItems = navGroups.flatMap((g) => g.items);

/** Choose the single most-specific nav item matching the current path. */
function activeTarget(pathname: string): string | null {
  const matches = allItems
    .map((i) => i.to)
    .filter((to) => pathname === to || pathname.startsWith(to + "/"))
    .sort((a, b) => b.length - a.length);
  return matches[0] ?? null;
}

function initialsOf(name?: string | null, email?: string | null): string {
  const src = (name ?? "").trim();
  if (src) {
    const parts = src.split(/\s+/).filter(Boolean);
    return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  const e = (email ?? "").trim();
  return e ? e[0]!.toUpperCase() : "מ";
}

function BrandMark({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
        <GraduationCap className="h-5 w-5" />
      </div>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="truncate text-base font-bold">ניהול הישיבה</div>
          <div className="truncate text-xs text-sidebar-foreground/60">מערכת ניהול ומעקב</div>
        </div>
      )}
    </div>
  );
}

function NavLinkItem({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      to={item.to}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200",
        collapsed && "justify-center px-0",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-sm"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="left">{item.label}</TooltipContent>
      </Tooltip>
    );
  }
  return link;
}

function NavList({
  collapsed,
  isAdmin,
  activeTo,
  onNavigate,
}: {
  collapsed: boolean;
  isAdmin: boolean;
  activeTo: string | null;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-5">
      {navGroups.map((group) => {
        const items = group.items.filter((i) => !i.adminOnly || isAdmin);
        if (items.length === 0) return null;
        return (
          <div key={group.heading} className="flex flex-col gap-1">
            {!collapsed && (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/45">
                {group.heading}
              </p>
            )}
            {items.map((item) => (
              <NavLinkItem
                key={item.to}
                item={item}
                active={activeTo === item.to}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        );
      })}
    </nav>
  );
}

function UserBlock({
  collapsed,
  name,
  email,
  roleLabel,
  onSignOut,
}: {
  collapsed: boolean;
  name: string;
  email?: string | null;
  roleLabel?: string | null;
  onSignOut: () => void;
}) {
  if (collapsed) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={onSignOut}
              className="flex w-full flex-col items-center gap-2 rounded-xl py-2 transition-colors hover:bg-sidebar-accent"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
                  {initialsOf(name, email)}
                </AvatarFallback>
              </Avatar>
              <LogOut className="h-4 w-4 text-sidebar-foreground/70" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">יציאה מהמערכת</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="rounded-xl bg-sidebar-accent/50 p-3">
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
            {initialsOf(name, email)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{name}</div>
          {roleLabel && (
            <span className="mt-0.5 inline-flex rounded-full bg-sidebar-primary/25 px-2 py-0.5 text-[11px] font-medium text-sidebar-foreground">
              {roleLabel}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onSignOut}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-sidebar-border py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <LogOut className="h-4 w-4" />
        יציאה
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const { data: profileData } = useProfile(user?.id);
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { mode: "signin" as const } });
  }

  const isAdmin = profileData?.isAdmin ?? false;
  const roles = profileData?.roles ?? [];
  const primaryRole: keyof typeof roleLabels | null = isAdmin
    ? "admin"
    : roles.includes("staff")
      ? "staff"
      : roles.includes("viewer")
        ? "viewer"
        : null;
  const roleLabel = primaryRole ? roleLabels[primaryRole] : null;

  const name =
    profileData?.profile?.full_name || profileData?.profile?.email || user?.email || "משתמש";
  const email = profileData?.profile?.email ?? user?.email;
  const activeTo = activeTarget(pathname);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop / tablet sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 lg:flex",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 border-b border-sidebar-border px-4 py-4",
            collapsed ? "justify-center" : "justify-between",
          )}
        >
          <BrandMark collapsed={collapsed} />
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="כווץ תפריט"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <div className="flex justify-center py-2">
            <button
              onClick={() => setCollapsed(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="הרחב תפריט"
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          </div>
        )}

        <TooltipProvider>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <NavList collapsed={collapsed} isAdmin={isAdmin} activeTo={activeTo} />
          </div>
        </TooltipProvider>

        <div className="border-t border-sidebar-border p-3">
          <UserBlock
            collapsed={collapsed}
            name={name}
            email={email}
            roleLabel={roleLabel}
            onSignOut={signOut}
          />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile / small-tablet top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-accent"
                aria-label="פתח תפריט"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex w-72 flex-col border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
            >
              <SheetTitle className="sr-only">תפריט ניווט</SheetTitle>
              <div className="border-b border-sidebar-border px-4 py-4">
                <BrandMark collapsed={false} />
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-4">
                <NavList
                  collapsed={false}
                  isAdmin={isAdmin}
                  activeTo={activeTo}
                  onNavigate={() => setMobileOpen(false)}
                />
              </div>
              <div className="border-t border-sidebar-border p-3">
                <UserBlock
                  collapsed={false}
                  name={name}
                  email={email}
                  roleLabel={roleLabel}
                  onSignOut={signOut}
                />
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold">ניהול הישיבה</span>
          </div>
        </header>

        <main className="flex-1 overflow-x-auto">
          <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
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
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className="hidden h-8 w-1.5 rounded-full bg-primary sm:block" aria-hidden />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        </div>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground sm:ms-[18px]">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
