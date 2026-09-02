/**
 * The dashboard as an arrangement, not a page.
 *
 * CJ, 2 Sep 2026: "allow me to move around my dashboard the same way we did for
 * the staff portal."
 *
 * ---------------------------------------------------------------------------
 * The one rule
 * ---------------------------------------------------------------------------
 * ARRANGEMENT, NEVER ACCESS. The saved layout may name anything at all. A tile
 * is only ever drawn if the page had something to put in it — every panel's
 * content was fetched by the server component for this account, through the
 * provider, which checks the caller, over RLS that checks them again. So a
 * hand-edited layout naming "other-families-balances" draws nothing, and a key
 * the app no longer has is dropped on the way in. The worst a bad layout can do
 * is hide a panel from the person who owns it.
 *
 * ---------------------------------------------------------------------------
 * Why the saved shape is four lists and not one
 * ---------------------------------------------------------------------------
 * `order` alone cannot tell "I took that off" from "the app added that after I
 * last touched this". Both look like a key missing from the array, and they
 * want opposite treatment: the first must stay off, the second must appear.
 * `hidden` is what separates them, and it is why a panel added next month turns
 * up on a dashboard somebody arranged in September rather than silently never
 * existing for them.
 *
 * ---------------------------------------------------------------------------
 * Zones, not a grid
 * ---------------------------------------------------------------------------
 * The staff portal learned this the expensive way (its 0210): a CSS grid lays
 * out in ROWS, so a row is as tall as its tallest tile and a short panel beside
 * a tall one leaves a hole the height of the difference. A zone is a STACK —
 * each column packs its own tiles top to bottom, so a short tile is followed
 * immediately by the next one whatever the other column is doing.
 *
 *   top    full width, across both columns
 *   left   the wide column
 *   right  the narrow one
 */

export type TileZone = "top" | "left" | "right";

export const ZONES: TileZone[] = ["top", "left", "right"];

export const ZONE_LABEL: Record<TileZone, string> = {
  top: "Full width",
  left: "Left column",
  right: "Right column",
};

/** What the page knows about one panel before anybody arranges anything. */
export interface TileDef {
  key: string;
  /** The name on the folded bar, in the arrange menu, and in the add list. */
  title: string;
  /** One line saying what it is, for the add list. */
  blurb: string;
  /** Which stack it starts in. */
  zone: TileZone;
  /**
   * Fixed to the top of the top zone: no move, no zone change, though it can
   * still be folded.
   *
   * Nothing on the dashboard uses this yet — the mission plaque, the tip and
   * the alert band are the masthead and sit outside the arranger entirely,
   * which is the stronger version of the same call the staff portal made. It
   * is here for the panel that has to be first without being masthead.
   */
  pinned?: boolean;
}

export interface DashboardLayout {
  order: string[];
  collapsed: string[];
  hidden: string[];
  zones: Record<string, TileZone>;
}

export const EMPTY_LAYOUT: DashboardLayout = {
  order: [],
  collapsed: [],
  hidden: [],
  zones: {},
};

/** Anything at all out of the jsonb column, made safe to render from. */
export function parseLayout(raw: unknown): DashboardLayout {
  const o = (raw ?? {}) as Record<string, unknown>;
  const list = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const zones: Record<string, TileZone> = {};
  if (o.zones && typeof o.zones === "object") {
    for (const [key, value] of Object.entries(o.zones as Record<string, unknown>)) {
      if (value === "top" || value === "left" || value === "right") zones[key] = value;
    }
  }

  return {
    order: list(o.order),
    collapsed: list(o.collapsed),
    hidden: list(o.hidden),
    zones,
  };
}

/** One tile, resolved: which stack it is in and whether it is folded. */
export interface PlacedTile {
  def: TileDef;
  zone: TileZone;
  collapsed: boolean;
  pinned: boolean;
}

/**
 * The tiles this person has, in the order they should be drawn.
 *
 * Saved order first, then anything the app has gained since — appended in
 * registry order rather than dropped, so a new panel arrives instead of
 * disappearing. Pinned tiles are forced to the front of the top zone in
 * registry order, whatever the saved order says about them.
 */
export function placeTiles(defs: TileDef[], layout: DashboardLayout): PlacedTile[] {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const hidden = new Set(layout.hidden);
  const collapsed = new Set(layout.collapsed);

  const ordered: TileDef[] = [];
  for (const key of layout.order) {
    const def = byKey.get(key);
    if (def && !ordered.includes(def)) ordered.push(def);
  }
  for (const def of defs) if (!ordered.includes(def)) ordered.push(def);

  const pinned = ordered.filter((d) => d.pinned);
  const rest = ordered.filter((d) => !d.pinned);

  return [...pinned, ...rest]
    .filter((def) => !hidden.has(def.key))
    .map((def) => ({
      def,
      zone: def.pinned ? "top" : (layout.zones[def.key] ?? def.zone),
      collapsed: collapsed.has(def.key),
      pinned: Boolean(def.pinned),
    }));
}

/** Permitted, but not on the dashboard right now — what the add list offers. */
export function availableTiles(defs: TileDef[], layout: DashboardLayout): TileDef[] {
  const hidden = new Set(layout.hidden);
  return defs.filter((def) => hidden.has(def.key));
}

/** Move a tile one place up or down WITHIN its own column. */
export function moveWithinZone(
  placed: PlacedTile[],
  layout: DashboardLayout,
  key: string,
  delta: -1 | 1
): DashboardLayout {
  const tile = placed.find((p) => p.def.key === key);
  if (!tile || tile.pinned) return layout;

  const column = placed.filter((p) => p.zone === tile.zone && !p.pinned);
  const at = column.findIndex((p) => p.def.key === key);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= column.length) return layout;

  // The order we save is the WHOLE dashboard's, so swapping two neighbours in
  // one column has to be expressed as a swap in the flat list.
  const flat = placed.map((p) => p.def.key);
  const from = flat.indexOf(key);
  const target = flat.indexOf(column[to].def.key);
  flat.splice(from, 1);
  flat.splice(target, 0, key);

  return { ...layout, order: flat };
}

export function setZone(
  layout: DashboardLayout,
  key: string,
  zone: TileZone
): DashboardLayout {
  return { ...layout, zones: { ...layout.zones, [key]: zone } };
}

export function toggleCollapsed(layout: DashboardLayout, key: string): DashboardLayout {
  const collapsed = layout.collapsed.includes(key)
    ? layout.collapsed.filter((k) => k !== key)
    : [...layout.collapsed, key];
  return { ...layout, collapsed };
}

/** Take it off the dashboard. It stays in the add list. */
export function hideTile(layout: DashboardLayout, key: string): DashboardLayout {
  return layout.hidden.includes(key)
    ? layout
    : { ...layout, hidden: [...layout.hidden, key] };
}

export function showTile(layout: DashboardLayout, key: string): DashboardLayout {
  return { ...layout, hidden: layout.hidden.filter((k) => k !== key) };
}

/** Has this person arranged anything, or is this what the app ships with? */
export function isCustomised(layout: DashboardLayout): boolean {
  return (
    layout.order.length > 0 ||
    layout.hidden.length > 0 ||
    layout.collapsed.length > 0 ||
    Object.keys(layout.zones).length > 0
  );
}
