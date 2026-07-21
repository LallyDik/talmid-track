import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Reached from the password-reset email link (/auth/reset). supabase-js parses
// the recovery token from the URL and establishes a temporary session, after
// which updateUser({ password }) is allowed.
export const Route = createFileRoute("/auth/reset")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // A recovery session may already be present, or arrive via the auth event.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("הסיסמאות אינן תואמות");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate({ to: "/dashboard" }), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "אירעה שגיאה");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-card border border-border p-8">
        <div className="text-center mb-6">
          <div className="text-sm font-medium text-primary mb-1">ניהול הישיבה</div>
          <h1 className="text-2xl font-bold">בחירת סיסמה חדשה</h1>
        </div>

        {done ? (
          <div className="text-center text-sm text-foreground bg-primary/10 rounded-md px-3 py-4">
            הסיסמה עודכנה בהצלחה. מעביר אותך למערכת...
          </div>
        ) : !ready ? (
          <div className="text-center text-sm text-muted-foreground">
            <p>הקישור אינו תקף או שפג תוקפו.</p>
            <button
              onClick={() => navigate({ to: "/auth", search: { mode: "signin" } })}
              className="mt-3 text-primary font-medium hover:underline"
            >
              בקשת קישור חדש
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">סיסמה חדשה</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">אישור סיסמה</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </div>
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-primary-foreground font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? "שומר..." : "עדכן סיסמה"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
