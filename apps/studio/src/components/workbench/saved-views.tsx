"use client";

import { useState } from "react";
import { Bookmark, Plus, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SavedView } from "@/lib/api";

interface SavedViewsProps {
  views: SavedView[];
  activeViewId: string | null;
  onApply: (view: SavedView) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}

export function SavedViews({
  views,
  activeViewId,
  onApply,
  onSave,
  onDelete,
}: SavedViewsProps) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const confirmSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setName("");
    setNaming(false);
  };

  if (naming) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmSave();
            if (e.key === "Escape") {
              setNaming(false);
              setName("");
            }
          }}
          placeholder="View name…"
          className="h-7 w-40 text-sm"
          aria-label="Saved view name"
        />
        <Button size="icon-sm" variant="ghost" onClick={confirmSave} aria-label="Save view">
          <Check className="size-4" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => {
            setNaming(false);
            setName("");
          }}
          aria-label="Cancel saving view"
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button className="inline-flex h-7 items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-sm hover:bg-muted">
              <Bookmark className="size-3.5" />
              {activeViewId
                ? views.find((v) => v.id === activeViewId)?.name ?? "Views"
                : "Views"}
            </button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-52">
          {views.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No saved views yet
            </div>
          ) : (
            views.map((view) => (
              <DropdownMenuItem
                key={view.id}
                onSelect={() => onApply(view)}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate">{view.name}</span>
                <button
                  type="button"
                  aria-label={`Delete view ${view.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onDelete(view.id);
                  }}
                  className="rounded-sm p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="sm"
        variant="ghost"
        onClick={() => setNaming(true)}
        className="gap-1"
      >
        <Plus className="size-3.5" />
        Save view
      </Button>
    </div>
  );
}
