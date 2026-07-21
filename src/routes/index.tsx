import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-2xl w-full text-center bg-card rounded-2xl shadow-xl border border-border p-10">
        <div className="text-sm font-medium text-primary mb-2">ניהול הישיבה</div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
          מערכת ניהול נוכחות ומעקב לישיבות
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
          העלאה של דוחות סרוקים, זיהוי אוטומטי של סימוני נוכחות, מעקב אישי אחר כל בחור, וניהול טיפולים ומשימות — הכל במקום אחד.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            to="/auth"
            search={{ mode: "signin" as const }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:opacity-90 transition"
          >
            כניסה למערכת
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" as const }}
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-6 py-3 text-base font-medium text-foreground hover:bg-accent transition"
          >
            הרשמה
          </Link>
        </div>
      </div>
    </div>
  );
}