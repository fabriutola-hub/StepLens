import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Activity } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toast";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { ThemeToggle } from "@/components/theme-toggle";
import { ErrorBoundary } from "@/components/error-boundary";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StepLens",
  description:
    "Local-first tool for recording, visualizing, debugging, and replaying AI agent executions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // suppressHydrationWarning lets the no-FOUC inline script mutate the
      // `class` attribute before React hydrates, without React warning.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <TooltipProvider>
          <ErrorBoundary>
            <div className="flex min-h-screen flex-col">
              {/* ── Top Nav ─────────────────────────────────────────── */}
              <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
                <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
                  <Link
                    href="/"
                    className="flex items-center gap-2 font-semibold"
                  >
                    <Activity className="size-5" />
                    <span className="hidden sm:inline">StepLens</span>
                  </Link>
                  <div className="flex items-center gap-1">
                    <Link
                      href="/traces"
                      className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      Traces
                    </Link>
                    <Link
                      href="/settings"
                      className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      Settings
                    </Link>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <a
                      href="https://github.com/fabriutola-hub/StepLens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title="View source on GitHub"
                    >
                      GitHub
                    </a>
                    <ThemeToggle />
                  </div>
                </div>
              </nav>

              {/* ── Content ──────────────────────────────────────────── */}
              {children}

              {/* ── Global overlays ──────────────────────────────────── */}
              <Toaster />
              <ConfirmDialogHost />
              <ShortcutsHelp />
            </div>
          </ErrorBoundary>
        </TooltipProvider>
      </body>
    </html>
  );
}
