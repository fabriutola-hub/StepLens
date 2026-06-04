"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, StickyNote } from "lucide-react";
import { FavoriteButton } from "./favorite-button";
import { TagEditor } from "./tag-editor";
import {
  updateAnnotation,
  type Annotation,
  type AnnotationInput,
} from "@/lib/api";

interface AnnotationPanelProps {
  traceId: string;
  initial?: Annotation | null;
  /** Notified after a successful save (e.g. to refresh list indicators). */
  onSaved?: (annotation: Annotation) => void;
}

const EMPTY: Pick<Annotation, "favorite" | "note" | "tags"> = {
  favorite: false,
  note: null,
  tags: [],
};

/**
 * Local annotation editor for the trace detail: favorite toggle, tag editor,
 * and a free-text note. Favorite/tags save immediately; the note saves on blur
 * (with a small "saved" confirmation).
 *
 * Callers should pass `key={traceId}` so the editor remounts on navigation
 * and we don't need a setState-in-effect to reset its internal state.
 */
export function AnnotationPanel({
  traceId,
  initial,
  onSaved,
}: AnnotationPanelProps) {
  const [favorite, setFavorite] = useState(initial?.favorite ?? EMPTY.favorite);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? EMPTY.tags);
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const savedNote = useRef(initial?.note ?? "");

  // Keep the "what's been saved" ref aligned with the `initial` prop without
  // calling setState — refs are write-only and safe to assign during commit.
  useEffect(() => {
    savedNote.current = initial?.note ?? "";
  }, [initial?.note]);

  const save = async (input: AnnotationInput) => {
    setSaving(true);
    try {
      const result = await updateAnnotation(traceId, input);
      setSavedAt(Date.now());
      onSaved?.(result);
    } catch {
      // Local-only metadata: surface failures quietly without blocking the UI.
    } finally {
      setSaving(false);
    }
  };

  const toggleFavorite = () => {
    const next = !favorite;
    setFavorite(next);
    void save({ favorite: next });
  };

  const updateTags = (next: string[]) => {
    setTags(next);
    void save({ tags: next });
  };

  const saveNote = () => {
    if (note === savedNote.current) return;
    savedNote.current = note;
    void save({ note: note.trim() === "" ? null : note });
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <StickyNote className="size-3.5" />
          Notes &amp; Tags
        </div>
        <div className="flex items-center gap-2">
          {saving ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : savedAt ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="size-3.5" /> Saved
            </span>
          ) : null}
          <FavoriteButton favorite={favorite} onToggle={toggleFavorite} size="md" />
        </div>
      </div>

      <TagEditor tags={tags} onChange={updateTags} />

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={saveNote}
        placeholder="Add a local note about this trace…"
        rows={3}
        className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </div>
  );
}
