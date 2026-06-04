"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Moon, RotateCcw, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSettings } from "@/lib/use-settings";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { useI18n } from "@/lib/use-i18n";
import { toast } from "@/components/ui/toast";
import type { Locale, PageSize, WorkspaceSettings } from "@/lib/settings-store";

const THEME_OPTIONS: Array<{ value: ThemeChoice; label: string; Icon: typeof Sun }> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

const PAGE_SIZES: PageSize[] = [10, 25, 50, 100];

const SORT_OPTIONS: WorkspaceSettings["defaultSort"][] = [
  "startedAt",
  "durationMs",
  "name",
  "status",
];

export default function SettingsPage() {
  const { settings, set, reset } = useSettings();
  const { set: setTheme } = useTheme();
  const { t, locale } = useI18n();
  const [dailyDraft, setDailyDraft] = useState(String(settings.budget.dailyUsd));
  const [monthlyDraft, setMonthlyDraft] = useState(
    String(settings.budget.monthlyUsd)
  );

  const patch = <K extends keyof WorkspaceSettings>(
    key: K,
    value: WorkspaceSettings[K]
  ) => {
    set({ [key]: value } as Partial<WorkspaceSettings>);
    toast.success(t("settings.saved"));
  };

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-6">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            aria-label={t("detail.back")}
          >
            <ArrowLeft className="size-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("settings.title")}
          </h1>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{locale.toUpperCase()}</span>
        </div>

        <div className="space-y-6">
          {/* ── Appearance ────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.section.appearance")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-1.5 text-sm font-medium">
                  {t("settings.theme")}
                </div>
                <div className="flex gap-2">
                  {THEME_OPTIONS.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTheme(value)}
                      className={
                        "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors " +
                        (settings.locale === "system" && value === "system"
                          ? ""
                          : "")
                      }
                      aria-pressed={value === "system"}
                    >
                      <Icon className="size-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <Field
                label={t("settings.locale")}
                hint={t("settings.locale.system") + " = browser default"}
              >
                <select
                  value={settings.locale}
                  onChange={(e) =>
                    patch("locale", e.target.value as Locale | "system")
                  }
                  className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
                >
                  <option value="system">{t("settings.locale.system")}</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </Field>

              <Toggle
                label={t("settings.compact-mode")}
                checked={settings.compactMode}
                onChange={(v) => patch("compactMode", v)}
              />
            </CardContent>
          </Card>

          {/* ── Workbench ─────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.section.workbench")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Toggle
                label={t("settings.live-updates")}
                checked={settings.liveUpdates}
                onChange={(v) => patch("liveUpdates", v)}
              />

              <Field
                label={t("settings.poll-interval")}
                hint="500 – 60000"
              >
                <Input
                  type="number"
                  min={500}
                  max={60_000}
                  step={500}
                  value={String(settings.pollIntervalMs)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) patch("pollIntervalMs", n);
                  }}
                  className="w-32"
                />
              </Field>

              <Field label={t("settings.default-page-size")}>
                <select
                  value={String(settings.defaultPageSize)}
                  onChange={(e) =>
                    patch("defaultPageSize", Number(e.target.value) as PageSize)
                  }
                  className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t("settings.default-sort")}>
                <select
                  value={settings.defaultSort}
                  onChange={(e) =>
                    patch(
                      "defaultSort",
                      e.target.value as WorkspaceSettings["defaultSort"]
                    )
                  }
                  className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
                >
                  {SORT_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            </CardContent>
          </Card>

          {/* ── Budgets ───────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.section.budgets")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Set 0 to disable an alert. Banner appears when the filtered
                Workbench cost exceeds the budget.
              </p>
              <Field label={t("settings.budget.daily")}>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={dailyDraft}
                  onChange={(e) => setDailyDraft(e.target.value)}
                  onBlur={() => {
                    const n = Number(dailyDraft);
                    if (Number.isFinite(n) && n >= 0) {
                      set({
                        budget: {
                          ...settings.budget,
                          dailyUsd: n,
                        },
                      });
                      toast.success(t("settings.saved"));
                    }
                  }}
                  className="w-32"
                />
              </Field>
              <Field label={t("settings.budget.monthly")}>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={monthlyDraft}
                  onChange={(e) => setMonthlyDraft(e.target.value)}
                  onBlur={() => {
                    const n = Number(monthlyDraft);
                    if (Number.isFinite(n) && n >= 0) {
                      set({
                        budget: {
                          ...settings.budget,
                          monthlyUsd: n,
                        },
                      });
                      toast.success(t("settings.saved"));
                    }
                  }}
                  className="w-32"
                />
              </Field>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                reset();
                toast.success(t("settings.saved"));
              }}
              className="gap-1.5"
            >
              <RotateCcw className="size-3.5" />
              {t("settings.reset")}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-medium">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={
          "inline-flex h-5 w-9 items-center rounded-full transition-colors " +
          (checked ? "bg-primary" : "bg-muted-foreground/30")
        }
      >
        <span
          className={
            "inline-block size-4 rounded-full bg-background shadow transition-transform " +
            (checked ? "translate-x-4" : "translate-x-0.5")
          }
        />
      </button>
    </div>
  );
}
