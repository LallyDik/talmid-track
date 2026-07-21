import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Compass, Home, RotateCw, TriangleAlert } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-10 text-center shadow-card">
        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl text-primary"
          style={{ backgroundColor: "color-mix(in oklch, var(--primary) 14%, transparent)" }}
        >
          <Compass className="h-8 w-8" />
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight text-foreground">404</h1>
        <h2 className="mt-3 text-lg font-semibold text-foreground">הדף לא נמצא</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          הדף שחיפשתם אינו קיים או שהועבר למקום אחר.
        </p>
        <div className="mt-7">
          <Button asChild>
            <Link to="/">
              <Home className="h-4 w-4" />
              חזרה לדף הבית
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-10 text-center shadow-card">
        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl text-destructive"
          style={{ backgroundColor: "color-mix(in oklch, var(--destructive) 14%, transparent)" }}
        >
          <TriangleAlert className="h-8 w-8" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          אירעה שגיאה בטעינת הדף
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          משהו השתבש. אפשר לנסות לרענן את הדף או לחזור לדף הבית.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            <RotateCw className="h-4 w-4" />
            נסה שוב
          </Button>
          <Button asChild variant="outline">
            <a href="/">
              <Home className="h-4 w-4" />
              חזרה לדף הבית
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ניהול הישיבה" },
      { name: "description", content: "מערכת לניהול נוכחות, מעקב וטיפול בבחורי ישיבה" },
      { property: "og:title", content: "ניהול הישיבה" },
      { property: "og:description", content: "מערכת לניהול נוכחות, מעקב וטיפול בבחורי ישיבה" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster richColors position="top-center" dir="rtl" />
    </QueryClientProvider>
  );
}
