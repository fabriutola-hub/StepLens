import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Activity } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <TooltipProvider>
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
                </div>
              </div>
            </nav>

            {/* ── Content ──────────────────────────────────────────── */}
            {children}
          </div>
        </TooltipProvider>
      </body>
    </html>
  );
}
