import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional().default("signin"),
  redirect: z.string().optional(),
  // Invite token from /auth?invite=<token>. Forwarded to signup so the DB
  // trigger can verify it server-side before granting a yeshiva/role.
  invite: z.string().optional(),
});

type Mode = "signin" | "signup" | "forgot";

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthPage,
});

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5Z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7Z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.5 39.6 16.2 44 24 44Z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.3C42 35.9 44 30.4 44 24c0-1.3-.1-2.3-.4-3.5Z" />
    </svg>
  );
}

function AuthPage() {
  const { mode: initialMode, redirect, invite } = Route.useSearch();
  const navigate = useNavigate();
  // An invite link is inherently a "join / create account" flow.
  const [mode, setMode] = useState<Mode>(invite ? "signup" : initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: redirect ?? "/dashboard" });
    });
  }, [navigate, redirect]);

  async function signInWithGoogle() {
    setError(null);
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${redirect ?? "/dashboard"}`,
        },
      });
      if (error) throw error;
      // On success the browser is redirected to Google — nothing else runs here.
    } catch (err) {
      setError(err instanceof Error ? err.message : "אירעה שגיאה בכניסה עם Google");
      setGoogleLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/reset`,
        });
        if (error) throw error;
        setInfo("שלחנו קישור לאיפוס הסיסמה לכתובת האימייל. בדוק את תיבת הדואר (וגם ספאם).");
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: invite ? { full_name: fullName, invite_token: invite } : { full_name: fullName },
          },
        });
        if (error) throw error;
        navigate({ to: redirect ?? "/dashboard" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: redirect ?? "/dashboard" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "אירעה שגיאה");
    } finally {
      setLoading(false);
    }
  }

  const title =
    mode === "signin" ? "כניסה למערכת" : mode === "signup" ? "הרשמה למערכת" : "איפוס סיסמה";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-card border border-border p-8">
        <div className="text-center mb-6">
          <div className="text-sm font-medium text-primary mb-1">ניהול הישיבה</div>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>

        {invite && mode !== "forgot" && (
          <div className="mb-4 rounded-md bg-primary/10 px-3 py-2 text-sm text-foreground">
            הוזמנת להצטרף לישיבה. יש להירשם עם כתובת האימייל שאליה נשלחה ההזמנה.
          </div>
        )}

        {mode !== "forgot" && (
          <>
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 rounded-md border border-input bg-background px-4 py-2.5 font-medium hover:bg-accent transition disabled:opacity-50"
            >
              <GoogleIcon />
              {googleLoading ? "מעביר ל-Google..." : "המשך עם Google"}
            </button>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              או
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-sm font-medium mb-1">שם מלא</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">אימייל</label>
            <input
              type="email"
              required
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-right"
            />
          </div>
          {mode !== "forgot" && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium">סיסמה</label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setError(null);
                      setInfo(null);
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    שכחת סיסמה?
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </div>
          )}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          {info && (
            <div className="text-sm text-foreground bg-primary/10 rounded-md px-3 py-2">
              {info}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-primary-foreground font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {loading
              ? "רגע..."
              : mode === "signin"
                ? "כניסה"
                : mode === "signup"
                  ? "הרשמה"
                  : "שלח קישור לאיפוס"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "forgot" ? (
            <button
              onClick={() => {
                setMode("signin");
                setError(null);
                setInfo(null);
              }}
              className="text-primary font-medium hover:underline"
            >
              ← חזרה לכניסה
            </button>
          ) : (
            <>
              {mode === "signin" ? "אין לך חשבון?" : "כבר יש לך חשבון?"}{" "}
              <button
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                  setInfo(null);
                }}
                className="text-primary font-medium hover:underline"
              >
                {mode === "signin" ? "הרשמה" : "כניסה"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
