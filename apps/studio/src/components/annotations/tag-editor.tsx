"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  className?: string;
  placeholder?: string;
}

/**
 * Editable tag list: chips with a remove button plus an input that adds a tag
 * on Enter (or comma). Tags are de-duplicated and trimmed.
 */
export function TagEditor({
  tags,
  onChange,
  className,
  placeholder = "Add tag…",
}: TagEditorProps) {
  const [draft, setDraft] = useState("");

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag || tags.includes(tag)) {
      setDraft("");
      return;
    }
    onChange([...tags, tag]);
    setDraft("");
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1">
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            onClick={() => removeTag(tag)}
            className="rounded-sm p-0.5 hover:bg-foreground/10"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag(draft);
          } else if (e.key === "Backspace" && draft === "" && tags.length) {
            removeTag(tags[tags.length - 1]);
          }
        }}
        onBlur={() => draft && addTag(draft)}
        placeholder={placeholder}
        className="h-7 w-28 flex-1 text-xs"
      />
    </div>
  );
}
