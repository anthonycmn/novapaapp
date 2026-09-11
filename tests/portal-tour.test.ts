import { describe, expect, it } from "vitest";
import { FAMILY_SECTIONS } from "@/config/navigation";
import { TOUR_VERSION, tourSteps } from "@/lib/tour";

/**
 * The tour points at real things (0083). These tests hold it to that: every
 * anchor it names is one the sidebar, the shell or the dashboard actually
 * renders, and every link it offers is a page in the menu. A step that points
 * at nothing would fall back to a centered card and still be wrong.
 */

const steps = tourSteps({ firstName: "Kelly", starPagesOpen: false, spiritButtonsOpen: true });

/* Marks that live outside the sidebar: the shell, the dashboard, Spot. */
const FIXED_ANCHORS = new Set([
  "sidebar", "menu-button", "bell", "spot", "stats", "week", "store", "full-calendar",
]);
const slug = (group: string) => group.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const NAV_ANCHORS = new Set([
  ...FAMILY_SECTIONS.map((s) => `nav${s.href.replace(/\//g, "-")}`),
  ...FAMILY_SECTIONS.map((s) => `nav-group-${slug(s.group)}`),
]);

describe("the tour points at real things", () => {
  it("has a version somebody can bump", () => {
    expect(Number.isInteger(TOUR_VERSION)).toBe(true);
    expect(TOUR_VERSION).toBeGreaterThan(0);
  });

  it("opens with a welcome and closes with a way back in", () => {
    expect(steps[0].key).toBe("welcome");
    expect(steps[0].title).toContain("Kelly");
    expect(steps[0].anchors).toEqual([]);
    expect(steps.at(-1)?.key).toBe("done");
    expect(steps.at(-1)?.body).toContain("Show me around");
  });

  it("names only anchors that exist", () => {
    for (const step of steps) {
      for (const anchor of step.anchors) {
        expect(FIXED_ANCHORS.has(anchor) || NAV_ANCHORS.has(anchor), `${step.key} → ${anchor}`).toBe(true);
      }
    }
  });

  it("links only to pages in the menu", () => {
    const hrefs = new Set(FAMILY_SECTIONS.map((s) => s.href));
    for (const step of steps) {
      if (step.link) expect(hrefs.has(step.link.href), `${step.key} → ${step.link.href}`).toBe(true);
    }
  });

  it("covers what CJ asked for", () => {
    const text = steps.map((s) => `${s.title} ${s.body}`).join(" ").toLowerCase();
    for (const thing of ["star pages", "spirit buttons", "family profile", "spot", "calendar", "shows", "dashboard"]) {
      expect(text, thing).toContain(thing);
    }
  });

  it("says a closed store feature is coming rather than open", () => {
    const closed = tourSteps({ firstName: "", starPagesOpen: false, spiritButtonsOpen: false });
    const store = closed.find((s) => s.key === "store")!;
    expect(store.body).toMatch(/opening soon/);
    expect(store.body).toMatch(/closer to the show/);
    const open = tourSteps({ firstName: "", starPagesOpen: true, spiritButtonsOpen: true });
    expect(open.find((s) => s.key === "store")!.body).not.toMatch(/soon|closer to/);
  });

  it("has no name in the welcome when there is none to use", () => {
    expect(tourSteps({ firstName: "", starPagesOpen: false, spiritButtonsOpen: false })[0].title).toBe("Welcome");
  });
});
