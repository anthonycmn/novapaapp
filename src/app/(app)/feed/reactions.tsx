"use client";

import { useOptimistic, useTransition } from "react";
import { reactAction } from "@/lib/actions/feed";
import type { ReactionKind } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const REACTIONS: Array<{ kind: ReactionKind; emoji: string; label: string }> = [
  { kind: "heart", emoji: "❤️", label: "Heart" },
  { kind: "clap", emoji: "👏", label: "Clap" },
  { kind: "star", emoji: "⭐", label: "Star" },
];

export function Reactions({
  postId,
  counts,
}: {
  postId: string;
  counts: Record<ReactionKind, number>;
}) {
  const [optimistic, bump] = useOptimistic(
    counts,
    (current, kind: ReactionKind) => ({ ...current, [kind]: current[kind] + 1 })
  );
  const [, startTransition] = useTransition();

  return (
    <div className="flex gap-1">
      {REACTIONS.map(({ kind, emoji, label }) => (
        <button
          key={kind}
          type="button"
          onClick={() =>
            startTransition(async () => {
              bump(kind);
              await reactAction(postId, kind);
            })
          }
          className={cn(
            "inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm",
            "hover:bg-accent active:scale-95 transition-transform"
          )}
        >
          <span aria-hidden>{emoji}</span>
          {optimistic[kind] > 0 && (
            <span className="tabular-nums">{optimistic[kind]}</span>
          )}
          {/* The visible label is a count, so the accessible name has to
              contain it (axe label-content-name-mismatch). Building the name
              from in-button text rather than an aria-label keeps them in
              sync automatically. */}
          <span className="sr-only">{label} reactions</span>
        </button>
      ))}
    </div>
  );
}
