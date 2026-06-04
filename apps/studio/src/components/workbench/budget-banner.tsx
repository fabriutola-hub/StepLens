"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useSettings } from "@/lib/use-settings";
import { useI18n } from "@/lib/use-i18n";
import { formatCostUsd } from "@/lib/timeline";
import { Button } from "@/components/ui/button";

interface BudgetBannerProps {
  /** Filtered cost in USD. The banner shows when this exceeds a budget. */
  filteredCostUsd: number;
}

/**
 * Persistent banner that appears at the top of the workbench when the
 * filtered cost exceeds a daily or monthly budget. Either limit being hit
 * triggers it; the first (in daily-first order) wins.
 */
export function BudgetBanner({ filteredCostUsd }: BudgetBannerProps) {
  const { settings } = useSettings();
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const daily = settings.budget.dailyUsd;
  const monthly = settings.budget.monthlyUsd;

  if (daily > 0 && filteredCostUsd > daily) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
        <AlertTriangle className="size-4 shrink-0" />
        <span className="flex-1">
          {t("budget.banner.daily", {
            spent: formatCostUsd(filteredCostUsd),
            budget: formatCostUsd(daily),
          })}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setDismissed(true)}
          aria-label={t("budget.banner.dismiss")}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  if (monthly > 0 && filteredCostUsd > monthly) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
        <AlertTriangle className="size-4 shrink-0" />
        <span className="flex-1">
          {t("budget.banner.monthly", {
            spent: formatCostUsd(filteredCostUsd),
            budget: formatCostUsd(monthly),
          })}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setDismissed(true)}
          aria-label={t("budget.banner.dismiss")}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  return null;
}
