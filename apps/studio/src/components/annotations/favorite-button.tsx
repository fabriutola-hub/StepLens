"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface FavoriteButtonProps {
  favorite: boolean;
  onToggle: () => void;
  className?: string;
  /** Larger hit area + icon for the detail header. */
  size?: "sm" | "md";
}

export function FavoriteButton({
  favorite,
  onToggle,
  className,
  size = "sm",
}: FavoriteButtonProps) {
  const iconSize = size === "md" ? "size-4" : "size-3.5";
  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
      title={favorite ? "Remove from favorites" : "Add to favorites"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "inline-flex items-center justify-center rounded-md p-1 transition-colors hover:bg-muted",
        className
      )}
    >
      <Star
        className={cn(
          iconSize,
          favorite
            ? "fill-amber-400 text-amber-400"
            : "text-muted-foreground/50"
        )}
      />
    </button>
  );
}
