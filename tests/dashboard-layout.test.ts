import { describe, expect, it } from "vitest";
import {
  EMPTY_LAYOUT,
  availableTiles,
  hideTile,
  isCustomised,
  moveWithinZone,
  parseLayout,
  placeTiles,
  setZone,
  showTile,
  toggleCollapsed,
  type TileDef,
} from "@/lib/dashboard-layout";

/**
 * The rules that make a saved dashboard survive the app changing under it
 * (0060). Everything here is about one of two failures:
 *
 *   - a panel added to the portal next month never appearing for anybody who
 *     arranged their dashboard before it existed, and
 *   - a panel somebody deliberately took off quietly coming back.
 *
 * Those look identical in a bare `order` array, which is why `hidden` exists.
 */

const DEFS: TileDef[] = [
  { key: "mission", title: "Mission", blurb: "", zone: "top", pinned: true },
  { key: "week", title: "This week", blurb: "", zone: "left" },
  { key: "news", title: "News", blurb: "", zone: "left" },
  { key: "notifications", title: "Notifications", blurb: "", zone: "right" },
];

describe("parseLayout", () => {
  it("makes anything at all safe to render from", () => {
    expect(parseLayout(null)).toEqual(EMPTY_LAYOUT);
    expect(parseLayout("nonsense")).toEqual(EMPTY_LAYOUT);
    expect(
      parseLayout({ order: ["week", 7, null], hidden: "no", zones: { week: "sideways" } })
    ).toEqual({ order: ["week"], collapsed: [], hidden: [], zones: {} });
  });

  it("keeps only the three real zones", () => {
    expect(parseLayout({ zones: { week: "right", news: "middle" } }).zones).toEqual({
      week: "right",
    });
  });
});

describe("placeTiles", () => {
  it("ships the registry order when nobody has arranged anything", () => {
    expect(placeTiles(DEFS, EMPTY_LAYOUT).map((t) => t.def.key)).toEqual([
      "mission",
      "week",
      "news",
      "notifications",
    ]);
  });

  it("honours a saved order and appends anything the app has gained since", () => {
    // Arranged before "notifications" existed: it must still turn up.
    const layout = parseLayout({ order: ["news", "week"] });
    expect(placeTiles(DEFS, layout).map((t) => t.def.key)).toEqual([
      "mission",
      "news",
      "week",
      "notifications",
    ]);
  });

  it("keeps a panel somebody took off, off", () => {
    const layout = hideTile(EMPTY_LAYOUT, "news");
    expect(placeTiles(DEFS, layout).map((t) => t.def.key)).not.toContain("news");
    expect(availableTiles(DEFS, layout).map((d) => d.key)).toEqual(["news"]);
    expect(placeTiles(DEFS, showTile(layout, "news")).map((t) => t.def.key)).toContain(
      "news"
    );
  });

  it("drops a key the app no longer has rather than drawing an empty tile", () => {
    const layout = parseLayout({ order: ["retired-panel", "week"] });
    expect(placeTiles(DEFS, layout).map((t) => t.def.key)).not.toContain("retired-panel");
  });

  it("pins the masthead to the top zone whatever the layout says", () => {
    const layout = setZone(parseLayout({ order: ["week", "mission"] }), "mission", "right");
    const placed = placeTiles(DEFS, layout);
    expect(placed[0].def.key).toBe("mission");
    expect(placed[0].zone).toBe("top");
  });
});

describe("moving a tile", () => {
  it("moves it within its own column only", () => {
    const placed = placeTiles(DEFS, EMPTY_LAYOUT);
    // "news" down past "week" — both are in the left column.
    const moved = moveWithinZone(placed, EMPTY_LAYOUT, "news", -1);
    expect(placeTiles(DEFS, moved).map((t) => t.def.key)).toEqual([
      "mission",
      "news",
      "week",
      "notifications",
    ]);
  });

  it("does nothing at the ends of a column", () => {
    const placed = placeTiles(DEFS, EMPTY_LAYOUT);
    expect(moveWithinZone(placed, EMPTY_LAYOUT, "week", -1)).toEqual(EMPTY_LAYOUT);
    expect(moveWithinZone(placed, EMPTY_LAYOUT, "notifications", 1)).toEqual(EMPTY_LAYOUT);
  });

  it("refuses to move a pinned tile", () => {
    const placed = placeTiles(DEFS, EMPTY_LAYOUT);
    expect(moveWithinZone(placed, EMPTY_LAYOUT, "mission", 1)).toEqual(EMPTY_LAYOUT);
  });
});

describe("folding and the reset", () => {
  it("folds and unfolds", () => {
    const folded = toggleCollapsed(EMPTY_LAYOUT, "week");
    expect(placeTiles(DEFS, folded).find((t) => t.def.key === "week")?.collapsed).toBe(true);
    expect(toggleCollapsed(folded, "week").collapsed).toEqual([]);
  });

  it("knows whether anything has been arranged at all", () => {
    expect(isCustomised(EMPTY_LAYOUT)).toBe(false);
    expect(isCustomised(toggleCollapsed(EMPTY_LAYOUT, "week"))).toBe(true);
    expect(isCustomised(hideTile(EMPTY_LAYOUT, "week"))).toBe(true);
    expect(isCustomised(setZone(EMPTY_LAYOUT, "week", "right"))).toBe(true);
  });
});
