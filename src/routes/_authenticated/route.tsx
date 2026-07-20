import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user, loading } = useAuth();
  const { data: profileData, isLoading: profileLoading } = useProfile(user?.id);
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (loading || profileLoading) return;
    setChecked(true);
    // If no yeshiva yet, force onboarding (unless already there)
    if (profileData && !profileData.profile?.yeshiva_id) {
      if (!window.location.pathname.startsWith("/onboarding")) {
        navigate({ to: "/onboarding" });
      }
    }
  }, [loading, profileLoading, profileData, navigate]);

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        טוען...
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}