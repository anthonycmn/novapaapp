import { describe, expect, it } from "vitest";
import {
  buildCurriculum,
  explicitWorkKind,
  normalizeTitle,
  pageRangesFrom,
  sceneSpecsFrom,
  songTitlesFrom,
  workKindFor,
  type CurriculumScene,
  type WorkedEvent,
} from "@/lib/ical/curriculum";

/**
 * The Sweeney curriculum, trimmed to what these cases need. Scene order is the
 * workbook's, which is what a "Prologue through Sc. 3" range walks.
 */
const SCENES: CurriculumScene[] = [
  { id: "p", kind: "scene", act: "I", label: "Prologue", name: "Act I · Prologue" },
  { id: "i1", kind: "scene", act: "I", label: "Sc. 1", name: "Act I · Sc. 1" },
  { id: "i2", kind: "scene", act: "I", label: "Sc. 2", name: "Act I · Sc. 2" },
  { id: "i3", kind: "scene", act: "I", label: "Sc. 3", name: "Act I · Sc. 3" },
  { id: "i4", kind: "scene", act: "I", label: "Sc. 4", name: "Act I · Sc. 4" },
  { id: "ii1", kind: "scene", act: "II", label: "Sc. 1", name: "Act II · Sc. 1" },
  { id: "ii9", kind: "scene", act: "II", label: "Sc. 9", name: "Act II · Sc. 9" },
  { id: "s2", kind: "song", act: null, label: null, name: "2. No Place Like London" },
  { id: "s4", kind: "song", act: null, label: null, name: "4. The Worst Pies in London" },
  { id: "s11", kind: "song", act: null, label: null, name: "11. Pirelli's Miracle Elixir" },
];

const at = (iso: string, title: string, description: string, type = "rehearsal"): WorkedEvent => ({
  startsAt: iso,
  title,
  type,
  description,
});

/** 7pm ET on the given day. */
const evening = (day: string) => `${day}T23:00:00.000Z`;

describe("reading scene references off a Scene: line", () => {
  it("reads a comma list under one act", () => {
    expect(sceneSpecsFrom("Act I Sc. 1, 2, 5, 8, 9")).toEqual([
      { act: "I", mode: "label", label: "Sc. 1" },
      { act: "I", mode: "label", label: "Sc. 2" },
      { act: "I", mode: "label", label: "Sc. 5" },
      { act: "I", mode: "label", label: "Sc. 8" },
      { act: "I", mode: "label", label: "Sc. 9" },
    ]);
  });

  it("carries the act across a semicolon and switches when told", () => {
    expect(sceneSpecsFrom("Act I Prologue, Sc. 2; Act II Sc. 9")).toEqual([
      { act: "I", mode: "label", label: "Prologue" },
      { act: "I", mode: "label", label: "Sc. 2" },
      { act: "II", mode: "label", label: "Sc. 9" },
    ]);
  });

  it("treats 'and' between scenes the same as a comma", () => {
    expect(sceneSpecsFrom("Act I Sc. 6 and Sc. 7")).toEqual([
      { act: "I", mode: "label", label: "Sc. 6" },
      { act: "I", mode: "label", label: "Sc. 7" },
    ]);
  });

  it("expands a whole act", () => {
    expect(sceneSpecsFrom("Act I complete")).toEqual([{ act: "I", mode: "all" }]);
    expect(sceneSpecsFrom("Acts I and II")).toEqual([
      { act: "I", mode: "all" },
      { act: "II", mode: "all" },
    ]);
  });

  /**
   * The trap this guards: "St. Dunstan's marketplace" is the room's note on
   * what the scene IS, not another scene. Reading it as one would attribute
   * the rehearsal to nothing and report a false miss.
   */
  it("drops the prose a dash introduces", () => {
    expect(sceneSpecsFrom("Act I Sc. 4 - St. Dunstan's marketplace")).toEqual([
      { act: "I", mode: "label", label: "Sc. 4" },
    ]);
    expect(sceneSpecsFrom("Act I Prologue - graveyard")).toEqual([
      { act: "I", mode: "label", label: "Prologue" },
    ]);
  });

  it("reads a range and ignores a parenthetical", () => {
    expect(sceneSpecsFrom("Act I - Prologue through Sc. 3 (read)")).toEqual([
      { act: "I", mode: "range", from: "Prologue", to: "Sc. 3" },
    ]);
  });

  it("returns nothing when no act is ever named", () => {
    expect(sceneSpecsFrom("Sc. 1, 2")).toEqual([]);
  });
});

describe("what kind of work a call is", () => {
  it("lets an explicit Work: line win over the title", () => {
    const event = at(evening("2026-09-12"), "Run Act I", "Work: blocking\nScene: Act I Sc. 1");
    expect(explicitWorkKind(event.description)).toBe("blocking");
    expect(workKindFor(event)).toBe("blocking");
  });

  /** A dress rehearsal stages things, but it is a run. First rule wins. */
  it("calls a dress run a run, not staging", () => {
    expect(workKindFor(at(evening("2026-10-14"), "Run Act I - Dress - Full Company", ""))).toBe("run");
  });

  it("reads tech and performances as runs regardless of title", () => {
    expect(workKindFor(at(evening("2026-10-19"), "ACT I", "", "tech"))).toBe("run");
    expect(workKindFor(at(evening("2026-10-23"), "OPENING NIGHT", "", "performance"))).toBe("run");
  });

  it("reads vocals as music and polishing as staging", () => {
    expect(workKindFor(at(evening("2026-09-19"), "Act II Vocals", ""))).toBe("music");
    expect(workKindFor(at(evening("2026-10-08"), "Act I Polishing all Ensemble", ""))).toBe("staging");
  });

  /**
   * A bare "Rehearsal - Rm A / Rm B" says nothing about the kind of work, and
   * guessing puts the date in the wrong column silently. Refusing is reported.
   */
  it("refuses to guess from a title that says nothing", () => {
    expect(workKindFor(at(evening("2026-09-10"), "Rehearsal - Rm A / Rm B", "Scene: Act I Sc. 1"))).toBeNull();
  });
});

describe("song titles", () => {
  it("matches across the curriculum's running number", () => {
    expect(normalizeTitle("11. Pirelli's Miracle Elixir")).toBe(normalizeTitle("Pirelli’s Miracle Elixir"));
  });

  it("splits a Music: line on semicolons", () => {
    expect(songTitlesFrom("No Place Like London; The Worst Pies in London")).toEqual([
      "No Place Like London",
      "The Worst Pies in London",
    ]);
  });
});

describe("rebuilding the curriculum from the calendar", () => {
  it("files scenes under the call's kind and songs under music", () => {
    const build = buildCurriculum(
      [
        at(
          evening("2026-08-27"),
          "Blocking - Rm A",
          "Scene: Act I Sc. 1, 2\nMusic: No Place Like London; The Worst Pies in London"
        ),
      ],
      SCENES
    );
    expect(build.bySceneId.get("i1")?.blocking_dates).toBe("8/27");
    expect(build.bySceneId.get("i2")?.blocking_dates).toBe("8/27");
    expect(build.bySceneId.get("s2")?.music_dates).toBe("8/27");
    expect(build.bySceneId.get("s4")?.music_dates).toBe("8/27");
    expect(build.bySceneId.get("i1")?.music_dates).toBeNull();
  });

  /** Everything touched in a run is a run, songs included. */
  it("files a song sung inside a run under run, not music", () => {
    const build = buildCurriculum(
      [at(evening("2026-10-14"), "FULL SHOW RUN", "Scene: Acts I and II\nMusic: No Place Like London")],
      SCENES
    );
    expect(build.bySceneId.get("s2")?.run_dates).toBe("10/14");
    expect(build.bySceneId.get("s2")?.music_dates).toBeNull();
    expect(build.bySceneId.get("ii9")?.run_dates).toBe("10/14");
  });

  it("walks a range in the workbook's own order", () => {
    const build = buildCurriculum(
      [at(evening("2026-08-24"), "Read-through", "Scene: Act I - Prologue through Sc. 3 (read)")],
      SCENES
    );
    for (const id of ["p", "i1", "i2", "i3"]) {
      expect(build.bySceneId.get(id)?.music_dates).toBe("8/24");
    }
    expect(build.bySceneId.get("i4")?.music_dates).toBeNull();
  });

  it("sorts several dates chronologically, not as text", () => {
    const build = buildCurriculum(
      [
        at(evening("2026-10-03"), "Blocking", "Scene: Act I Sc. 1"),
        at(evening("2026-09-12"), "Blocking", "Scene: Act I Sc. 1"),
        at(evening("2026-10-12"), "Blocking", "Scene: Act I Sc. 1"),
      ],
      SCENES
    );
    expect(build.bySceneId.get("i1")?.blocking_dates).toBe("9/12, 10/3, 10/12");
  });

  /**
   * The whole point of a rebuild rather than a merge: a scene the calendar
   * stopped mentioning must stop claiming the dates it used to have.
   */
  it("clears a scene no call mentions", () => {
    const build = buildCurriculum([at(evening("2026-08-27"), "Blocking", "Scene: Act I Sc. 1")], SCENES);
    expect(build.bySceneId.get("ii1")).toEqual({
      music_dates: null,
      blocking_dates: null,
      staging_dates: null,
      run_dates: null,
    });
  });

  it("reports a call with no Scene:/Music: line instead of dropping it", () => {
    const build = buildCurriculum(
      [at(evening("2026-09-10"), "Rehearsal - Rm A / Rm B", "CALLED (5): Sweeney Todd · Mrs. Lovett")],
      SCENES
    );
    expect(build.silent).toEqual([{ date: "9/10", title: "Rehearsal - Rm A / Rm B" }]);
    expect(build.unclassified).toEqual([]);
  });

  it("reports a call it has work for but no kind, and files nothing", () => {
    const build = buildCurriculum(
      [at(evening("2026-09-10"), "Rehearsal - Rm A / Rm B", "Scene: Act I Sc. 1")],
      SCENES
    );
    expect(build.unclassified).toEqual([{ date: "9/10", title: "Rehearsal - Rm A / Rm B" }]);
    expect(build.bySceneId.get("i1")?.blocking_dates).toBeNull();
  });

  it("reports text that matches no scene or song", () => {
    const build = buildCurriculum(
      [at(evening("2026-08-29"), "Vocals", "Music: The Ballad of Sweeney Todd — reprises 1, 2 and 3")],
      SCENES
    );
    expect(build.unmatched).toEqual([
      { date: "8/29", line: "Music", value: "The Ballad of Sweeney Todd — reprises 1, 2 and 3" },
    ]);
  });
});

/**
 * Script pages, Tony's own way of calling a rehearsal. Script pagination ONLY —
 * the vocal score paginates differently, so a music call keeps naming its
 * numbers on the Music: line rather than resolving score pages against this map.
 */
const PAGED: CurriculumScene[] = [
  { id: "p", kind: "scene", act: "I", label: "Prologue", name: "Act I · Prologue", fromPage: 1, toPage: 4 },
  { id: "i1", kind: "scene", act: "I", label: "Sc. 1", name: "Act I · Sc. 1", fromPage: 5, toPage: 11 },
  { id: "i2", kind: "scene", act: "I", label: "Sc. 2", name: "Act I · Sc. 2", fromPage: 12, toPage: 20 },
  { id: "i3", kind: "scene", act: "I", label: "Sc. 3", name: "Act I · Sc. 3", fromPage: 21, toPage: 28 },
  { id: "s2", kind: "song", act: null, label: null, name: "2. No Place Like London", fromPage: 6, toPage: 9 },
  { id: "s4", kind: "song", act: null, label: null, name: "4. The Worst Pies in London", fromPage: 14, toPage: 17 },
  // Deliberately unmapped: the normal state until the script is walked.
  { id: "i9", kind: "scene", act: "I", label: "Sc. 9", name: "Act I · Sc. 9" },
];

describe("reading a Pages: line", () => {
  it("reads ranges, single pages and lists", () => {
    expect(pageRangesFrom("12-18")).toEqual([{ from: 12, to: 18 }]);
    expect(pageRangesFrom("12–18")).toEqual([{ from: 12, to: 18 }]);
    expect(pageRangesFrom("12 to 18")).toEqual([{ from: 12, to: 18 }]);
    expect(pageRangesFrom("7")).toEqual([{ from: 7, to: 7 }]);
    expect(pageRangesFrom("12-18, 22-24")).toEqual([
      { from: 12, to: 18 },
      { from: 22, to: 24 },
    ]);
  });

  it("tolerates a pp. prefix and ignores an annotation", () => {
    expect(pageRangesFrom("pp. 12-18")).toEqual([{ from: 12, to: 18 }]);
    expect(pageRangesFrom("12-18 (Sc. 2)")).toEqual([{ from: 12, to: 18 }]);
  });

  it("puts a backwards range the right way round", () => {
    expect(pageRangesFrom("18-12")).toEqual([{ from: 12, to: 18 }]);
  });
});

describe("rebuilding the curriculum from script pages", () => {
  /** Overlap, not containment — a clipped scene was still worked. */
  it("marks every scene and number the pages touch", () => {
    const build = buildCurriculum(
      [at(evening("2026-09-10"), "Blocking - Rm A", "Pages: 8-15")],
      PAGED
    );
    expect(build.bySceneId.get("i1")?.blocking_dates).toBe("9/10"); // 5-11, clipped
    expect(build.bySceneId.get("i2")?.blocking_dates).toBe("9/10"); // 12-20, clipped
    expect(build.bySceneId.get("p")?.blocking_dates).toBeNull(); // 1-4, untouched
    expect(build.bySceneId.get("i3")?.blocking_dates).toBeNull(); // 21-28, untouched
  });

  /** One line does the work of both: scenes take the kind, songs are sung. */
  it("files songs in those pages under music, not the call's kind", () => {
    const build = buildCurriculum(
      [at(evening("2026-09-10"), "Blocking - Rm A", "Pages: 5-20")],
      PAGED
    );
    expect(build.bySceneId.get("i1")?.blocking_dates).toBe("9/10");
    expect(build.bySceneId.get("s2")?.music_dates).toBe("9/10");
    expect(build.bySceneId.get("s2")?.blocking_dates).toBeNull();
  });

  it("puts everything under run when the call is a run", () => {
    const build = buildCurriculum(
      [at(evening("2026-10-03"), "FULL SHOW RUN", "Pages: 1-28")],
      PAGED
    );
    expect(build.bySceneId.get("i1")?.run_dates).toBe("10/3");
    expect(build.bySceneId.get("s2")?.run_dates).toBe("10/3");
    expect(build.bySceneId.get("s2")?.music_dates).toBeNull();
  });

  it("mixes with Scene: and Music: lines in one description", () => {
    const build = buildCurriculum(
      [at(evening("2026-09-10"), "Blocking", "Pages: 5-11\nScene: Act I Sc. 3")],
      PAGED
    );
    expect(build.bySceneId.get("i1")?.blocking_dates).toBe("9/10");
    expect(build.bySceneId.get("i3")?.blocking_dates).toBe("9/10");
  });

  /**
   * The visible signal that the page map still needs walking. Reporting beats
   * silence: a Pages: line resolving to nothing must not look like success.
   */
  it("reports a page run that maps to nothing", () => {
    const build = buildCurriculum(
      [at(evening("2026-09-10"), "Blocking", "Pages: 90-95")],
      PAGED
    );
    expect(build.unmatched).toEqual([{ date: "9/10", line: "Pages", value: "90-95" }]);
  });

  it("never matches a row that has no page map", () => {
    const build = buildCurriculum(
      [at(evening("2026-09-10"), "Blocking", "Pages: 1-28")],
      PAGED
    );
    expect(build.bySceneId.get("i9")?.blocking_dates).toBeNull();
  });

  it("counts a Pages: line as work, so the call is not reported silent", () => {
    const build = buildCurriculum(
      [at(evening("2026-09-10"), "Blocking", "Pages: 8-15")],
      PAGED
    );
    expect(build.silent).toEqual([]);
  });
});
