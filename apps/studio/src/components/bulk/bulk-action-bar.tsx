"use client";

import { useState } from "react";
import { Download, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { confirmAction } from "@/components/ui/confirm-dialog";
import {
  bulkDeleteTraces,
  bulkTagTraces,
  exportBulk,
} from "@/lib/api";
import { useI18n } from "@/lib/use-i18n";

interface BulkActionBarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onActionComplete: () => void;
}

/**
 * Floating action bar that appears when one or more traces are selected in
 * the workbench. Bulk delete, bulk tag, and bulk export zip.
 */
export function BulkActionBar({
  selectedIds,
  onClearSelection,
  onActionComplete,
}: BulkActionBarProps) {
  const { t } = useI18n();
  const [tagDraft, setTagDraft] = useState("");

  if (selectedIds.length === 0) return null;

  const handleDelete = async () => {
    const ok = await confirmAction({
      title: t("confirm.bulk-delete.title", { count: selectedIds.length }),
      description: t("confirm.bulk-delete.description"),
      confirmLabel: t("confirm.delete.confirm"),
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await bulkDeleteTraces(selectedIds);
      toast.success(t("toast.bulk-deleted", { count: selectedIds.length }));
      onClearSelection();
      onActionComplete();
    } catch (err) {
      toast.error(t("toast.delete-failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleAddTag = async () => {
    const tag = tagDraft.trim();
    if (!tag) return;
    try {
      await bulkTagTraces(selectedIds, "add", tag);
      toast.success("Tag added", { description: tag });
      setTagDraft("");
      onActionComplete();
    } catch (err) {
      toast.error("Tag failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleExport = async () => {
    try {
      await exportBulk(selectedIds);
      toast.success(t("toast.exported"), {
        description: `${selectedIds.length} trace${selectedIds.length === 1 ? "" : "s"} written.`,
      });
    } catch (err) {
      toast.error(t("toast.export-failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-lg animate-in slide-in-from-bottom-2 fade-in">
        <span className="text-sm font-medium">
          {t("workbench.bulk-selected", { count: selectedIds.length })}
        </span>
        <span className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1">
          <Input
            placeholder="tag…"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddTag();
            }}
            className="h-7 w-28"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleAddTag()}
            disabled={!tagDraft.trim()}
            className="gap-1"
          >
            <Tag className="size-3.5" />
            {t("workbench.bulk-tag")}
          </Button>
        </div>
        <span className="h-4 w-px bg-border" />
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleExport()}
          className="gap-1"
        >
          <Download className="size-3.5" />
          {t("workbench.bulk-export")}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => void handleDelete()}
          className="gap-1"
        >
          <Trash2 className="size-3.5" />
          {t("workbench.bulk-delete")}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onClearSelection}
          aria-label={t("workbench.bulk-clear")}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
