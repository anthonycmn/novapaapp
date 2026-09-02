"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  Columns2,
  GripVertical,
  Plus,
  RotateCcw,
  Settings2,
  X,
} from "lucide-react";
import { saveDashboardLayoutAction } from "@/lib/actions/dashboard";
import {
  EMPTY_LAYOUT,
  ZONES,
  ZONE_LABEL,
  availableTiles,
  hideTile,
  isCustomised,
  moveWithinZone,
  placeTiles,
  setZone,
  showTile,
  toggleCollapsed,
  type DashboardLayout,
  type TileDef,
  type TileZone,
} from "@/lib/dashboard-layout";
import { cn } from "@/lib/utils";

/**
 * The dashboard you can move around (0060).
 *
 * CJ, 2 Sep 2026: "allow me to move around my dashboard the same way we did for
 * the staff portal." That portal's answer is a client component over a saved
 * jsonb, and this is the same, adapted to the one real difference between the
 * two apps: these panels are SERVER components. Their content is fetched on the
 * server for this account and handed to this component as already-rendered
 * nodes, so arranging them moves finished panels around — it never re-fetches,
 * and there is no client-side query here that could ask for somebody else's.
 *
 * Arrange mode is a mode on purpose. A dashboard where every panel wears a
 * grip, a fold arrow, a column picker and a remove button is a control panel,
 * not a dashboard. Off, the page is what it always was; on, every panel grows
 * its handles.
 *
 * Saving is optimistic. The layout is applied locally and written in the
 * background, because the alternative — a spinner between clicking "down" and
 * seeing the panel move — makes arranging five panels feel like filing a form.
 * A failed save leaves the screen right and the record wrong, which is the
 * mildest failure available here: the worst case is the panels are back where
 * they were next time.
 */
export interface ArrangerTile {
  def: TileDef;
  /** The finished panel, rendered on the server. */
  node: ReactNode;
}

export function DashboardArranger({
  tiles,
  saved,
}: {
  tiles: ArrangerTile[];
  saved: DashboardLayout;
}) {
  const [layout, setLayout] = useState<DashboardLayout>(saved);
  const [arranging, setArranging] = useState(false);
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();

  const defs = useMemo(() => tiles.map((t) => t.def), [tiles]);
  const nodeFor = useMemo(
    () => new Map(tiles.map((t) => [t.def.key, t.node])),
    [tiles]
  );

  const placed = useMemo(() => placeTiles(defs, layout), [defs, layout]);
  const available = useMemo(() => availableTiles(defs, layout), [defs, layout]);

  function apply(next: DashboardLayout) {
    setLayout(next);
    startTransition(() => {
      void saveDashboardLayoutAction(next);
    });
  }

  const inZone = (zone: TileZone) => placed.filter((tile) => tile.zone === zone);

  function panel(key: string, title: string, collapsed: boolean, pinned: boolean) {
    const node = nodeFor.get(key);
    return (
      <div key={key} className={cn(arranging && "rounded-lg outline outline-1 outline-dashed outline-border")}>
        {arranging && (
          <div className="flex flex-wrap items-center gap-1 rounded-t-lg border-b bg-muted/60 px-2 py-1.5 text-[12px]">
            <GripVertical aria-hidden size={13} className="text-muted-foreground" />
            <span className="mr-auto font-medium">{title}</span>

            <button
              type="button"
              aria-label={collapsed ? `Unfold ${title}` : `Fold ${title}`}
              onClick={() => apply(toggleCollapsed(layout, key))}
              className="rounded p-1 hover:bg-background"
            >
              {collapsed ? <ChevronDown aria-hidden size={14} /> : <ChevronUp aria-hidden size={14} />}
            </button>

            {!pinned && (
              <>
                <button
                  type="button"
                  aria-label={`Move ${title} up`}
                  onClick={() => apply(moveWithinZone(placed, layout, key, -1))}
                  className="rounded px-1.5 py-1 hover:bg-background"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${title} down`}
                  onClick={() => apply(moveWithinZone(placed, layout, key, 1))}
                  className="rounded px-1.5 py-1 hover:bg-background"
                >
                  ↓
                </button>
                <select
                  aria-label={`Which column ${title} sits in`}
                  value={placed.find((p) => p.def.key === key)?.zone ?? "left"}
                  onChange={(e) => apply(setZone(layout, key, e.target.value as TileZone))}
                  className="rounded border bg-background px-1 py-0.5 text-[12px]"
                >
                  {ZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {ZONE_LABEL[zone]}
                    </option>
                  ))}
                </select>
              </>
            )}

            <button
              type="button"
              aria-label={`Take ${title} off the dashboard`}
              onClick={() => apply(hideTile(layout, key))}
              className="rounded p-1 hover:bg-background"
            >
              <X aria-hidden size={14} />
            </button>
          </div>
        )}

        {/* Folded is a real state, not a display trick: the panel is not
            rendered at all, so a folded calendar is not quietly doing work
            behind a closed door. */}
        {collapsed ? (
          <button
            type="button"
            onClick={() => apply(toggleCollapsed(layout, key))}
            className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-2.5 text-left text-[13px] font-medium shadow-[var(--shadow-card)] hover:bg-muted"
          >
            {title}
            <ChevronDown aria-hidden size={14} className="text-muted-foreground" />
          </button>
        ) : (
          node
        )}
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setArranging((on) => !on);
            setAdding(false);
          }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors",
            arranging ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          <Settings2 aria-hidden size={14} />
          {arranging ? "Done arranging" : "Arrange dashboard"}
        </button>

        {arranging && (
          <>
            <button
              type="button"
              onClick={() => setAdding((on) => !on)}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium hover:bg-muted"
            >
              <Plus aria-hidden size={14} />
              Add a panel
              {available.length > 0 && (
                <span className="rounded-full bg-muted px-1.5 text-[11px]">
                  {available.length}
                </span>
              )}
            </button>

            {isCustomised(layout) && (
              <button
                type="button"
                onClick={() => apply(EMPTY_LAYOUT)}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium hover:bg-muted"
              >
                <RotateCcw aria-hidden size={14} />
                Start over
              </button>
            )}

            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Columns2 aria-hidden size={13} />
              Fold, move, or take a panel off. Saved as you go, to your account.
            </p>
          </>
        )}
      </div>

      {arranging && adding && (
        <div className="mb-4 rounded-lg border bg-card p-3">
          {available.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Every panel is already on your dashboard.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {available.map((def) => (
                <li key={def.key}>
                  <button
                    type="button"
                    onClick={() => apply(showTile(layout, def.key))}
                    className="flex w-full items-start gap-2 rounded-md border p-2.5 text-left hover:bg-muted"
                  >
                    <Plus aria-hidden size={14} className="mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">{def.title}</span>
                      <span className="mt-0.5 block text-[12px] text-muted-foreground">
                        {def.blurb}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Three zones: full width, then two stacks. Each stack packs its own
          tiles top to bottom, which is what stops a short panel beside a tall
          one leaving a hole the height of the difference. */}
      <div className="flex flex-col gap-4">
        {inZone("top").map((tile) =>
          panel(tile.def.key, tile.def.title, tile.collapsed, tile.pinned)
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            {inZone("left").map((tile) =>
              panel(tile.def.key, tile.def.title, tile.collapsed, tile.pinned)
            )}
          </div>
          <div className="flex flex-col gap-4">
            {inZone("right").map((tile) =>
              panel(tile.def.key, tile.def.title, tile.collapsed, tile.pinned)
            )}
          </div>
        </div>
      </div>
    </>
  );
}
