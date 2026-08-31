import { formatInTimeZone } from "date-fns-tz";
import { org } from "@/config/org";
import { descriptionLines } from "@/lib/ical/map";

/**
 * Deriving the curriculum — family_hub.show_scenes — from the show calendar.
 *
 * Tony, 31 Aug 2026: "rebuild from the calendar and have it sync automatically
 * so that as I put stuff in the bridge works." So this is not a one-off import.
 * The hourly iCal sync calls it, which makes the Google calendar the single
 * writer for WHEN each scene and number is worked, exactly as it already is
 * for when each call is.
 *
 * The calendar states the work on two labelled lines per room block:
 *
 *   Scene: Act I Sc. 1, 2, 5, 8, 9
 *   Music: No Place Like London; The Worst Pies in London
 *
 * Kept apart from the database for the same reason as map.ts: the rules with
 * the sharp edges stay unit-testable.
 *
 * SCOPE: this owns the four date columns and nothing else. act, label, setting,
 * characters and numbers are the workbook's prose, a person wrote them, and no
 * parser is going to improve on that by guessing.
 */

export type WorkKind = "music" | "blocking" | "staging" | "run";

/** A row of family_hub.show_scenes, as much of it as the matching needs. */
export interface CurriculumScene {
  id: string;
  kind: "scene" | "song";
  act?: string | null;
  label?: string | null;
  name: string;
  /** Script pages, inclusive. Null until the script has been walked once. */
  fromPage?: number | null;
  toPage?: number | null;
}

/** An inclusive run of script pages, as a call sheet states it. */
export interface PageRange {
  from: number;
  to: number;
}

/** One call, reduced to what the curriculum cares about. */
export interface WorkedEvent {
  /** Event start, ISO. The local date is what lands in the column. */
  startsAt: string;
  title: string;
  /** calendar_events.type — tech and performances are runs by definition. */
  type: string;
  /** The raw VEVENT description, still HTML. */
  description: string;
}

export interface CurriculumDates {
  music_dates: string | null;
  blocking_dates: string | null;
  staging_dates: string | null;
  run_dates: string | null;
}

export interface CurriculumBuild {
  /** scene id → the four columns, for every scene of the production. */
  bySceneId: Map<string, CurriculumDates>;
  /** Calls whose kind could not be read; they contribute nothing. */
  unclassified: Array<{ date: string; title: string }>;
  /** Scene: and Music: text that matched no row, for the sync's report. */
  unmatched: Array<{ date: string; line: string; value: string }>;
  /** Calls carrying no Scene:/Music: line at all — the gap worth reporting. */
  silent: Array<{ date: string; title: string }>;
}

/* ── reading the labelled lines ─────────────────────────────────────────── */

function valuesFor(description: string, label: "Scene" | "Music"): string[] {
  const out: string[] = [];
  for (const line of descriptionLines(description)) {
    const match = line.match(/^(Scene|Music)\s*:\s*(.+)$/i);
    if (!match) continue;
    if (match[1].toLowerCase() !== label.toLowerCase()) continue;
    const value = match[2].trim();
    if (value) out.push(value);
  }
  return out;
}

/** "Pages: 12-18" / "Page: 7" / "pp. 12-18" — the same line, spelled loosely. */
function pageValuesFor(description: string): string[] {
  const out: string[] = [];
  for (const line of descriptionLines(description)) {
    const match = line.match(/^(?:pages?|pp?)\s*\.?\s*:\s*(.+)$/i);
    if (!match) continue;
    const value = match[1].trim();
    if (value) out.push(value);
  }
  return out;
}

/**
 * Read the page runs off a Pages: line.
 *
 * "12-18" / "12–18" / "12 to 18" / "7" / "12-18, 22-24" all read. A bare number
 * is a single page. Parentheticals are the caller's own annotation — "12-18
 * (Sc. 4)" is one range, not a range and a stray 4 — so they come off first.
 */
export function pageRangesFrom(value: string): PageRange[] {
  const cleaned = value
    .replace(/\([^)]*\)/g, " ")
    .replace(/^\s*pp?\s*\.?\s*/i, " ");
  const ranges: PageRange[] = [];
  const pattern = /(\d+)\s*(?:[-–—]|\bto\b)\s*(\d+)|(\d+)/g;
  for (const match of cleaned.matchAll(pattern)) {
    if (match[1] && match[2]) {
      const from = Number(match[1]);
      const to = Number(match[2]);
      ranges.push(from <= to ? { from, to } : { from: to, to: from });
    } else if (match[3]) {
      const only = Number(match[3]);
      ranges.push({ from: only, to: only });
    }
  }
  return ranges;
}

/**
 * Everything those pages touch, scenes and numbers alike.
 *
 * Overlap, not containment: a call working pp. 30-34 works every scene and
 * number those pages run through, even the ones it only clips. A row with no
 * page map yet matches nothing rather than everything.
 */
function pagesTouch(ranges: PageRange[], scenes: CurriculumScene[]): string[] {
  const ids: string[] = [];
  for (const scene of scenes) {
    const from = scene.fromPage;
    const to = scene.toPage;
    if (typeof from !== "number" || typeof to !== "number") continue;
    if (ranges.some((range) => from <= range.to && to >= range.from)) {
      ids.push(scene.id);
    }
  }
  return ids;
}

/**
 * An explicit "Work: staging" line, when the calendar wants to be exact.
 *
 * Inference from the title is a convenience, not a contract — this is the way
 * to say it outright, and it always wins.
 */
export function explicitWorkKind(description: string): WorkKind | null {
  for (const line of descriptionLines(description)) {
    const match = line.match(/^Work\s*:\s*(music|blocking|staging|run)\b/i);
    if (match) return match[1].toLowerCase() as WorkKind;
  }
  return null;
}

/**
 * What kind of work a call is, from its title.
 *
 * Order matters: "Run Act I - Dress - Full Company" is a run, not a staging
 * call, even though a dress rehearsal stages things. First rule wins.
 */
const KIND_RULES: Array<[RegExp, WorkKind]> = [
  [/\b(run|runs|run-?thru|run through|dress|off ?book)\b/i, "run"],
  [/\b(tech|cue to cue)\b/i, "run"],
  [/\bblocking\b/i, "blocking"],
  [/\b(staging|stage|movement|choreo|dance|polish|polishing|fixes)\b/i, "staging"],
  [/\b(vocal|vocals|sing|music|musical|ballad|score|read-?through|read through)\b/i, "music"],
];

export function workKindFor(event: WorkedEvent): WorkKind | null {
  const explicit = explicitWorkKind(event.description);
  if (explicit) return explicit;
  if (event.type === "performance" || event.type === "tech") return "run";
  for (const [pattern, kind] of KIND_RULES) {
    if (pattern.test(event.title)) return kind;
  }
  return null;
}

/* ── scene references ───────────────────────────────────────────────────── */

interface SceneSpec {
  act: string;
  /** A single label, a range between two labels, or the whole act. */
  mode: "label" | "range" | "all";
  label?: string;
  from?: string;
  to?: string;
}

function normalizeLabel(raw: string): string | null {
  const text = raw.trim().replace(/[.,;]+$/, "");
  if (!text) return null;
  if (/^prologue$/i.test(text)) return "Prologue";
  if (/^epilogue$/i.test(text)) return "Epilogue";
  if (/^finale$/i.test(text)) return "Finale";
  const scene = text.match(/^(?:sc\.?|scene)\s*(\d+)$/i);
  if (scene) return `Sc. ${Number(scene[1])}`;
  const bare = text.match(/^(\d+)$/);
  if (bare) return `Sc. ${Number(bare[1])}`;
  return null;
}

/**
 * Parse one Scene: value into specs.
 *
 * The calendar writes these the way a director says them out loud:
 *   "Act I Sc. 1, 2, 5, 8, 9"
 *   "Act I Prologue, Sc. 2, 4, 5; Act II Sc. 9"
 *   "Act I - Prologue through Sc. 3 (read)"
 *   "Act I Sc. 4 - St. Dunstan's marketplace"
 *   "Acts I and II"
 *   "Act II complete"
 *
 * Semicolons separate act groups; an omitted act carries the previous one
 * forward. Anything after a dash is the room's own description of the work and
 * is not a scene reference — "St. Dunstan's marketplace" is not a label.
 */
export function sceneSpecsFrom(value: string): SceneSpec[] {
  const specs: SceneSpec[] = [];
  let currentActs: string[] = [];

  for (const group of value.split(";")) {
    let text = group.trim();
    if (!text) continue;

    // "Acts I and II" — both acts, before the singular form gets a look in.
    const bothActs = text.match(/^acts?\s+(I{1,3}|IV|V)\s+and\s+(I{1,3}|IV|V)\b/i);
    if (bothActs) {
      currentActs = [bothActs[1].toUpperCase(), bothActs[2].toUpperCase()];
      text = text.slice(bothActs[0].length).trim();
    } else {
      const oneAct = text.match(/^act\s+(I{1,3}|IV|V)\b/i);
      if (oneAct) {
        currentActs = [oneAct[1].toUpperCase()];
        text = text.slice(oneAct[0].length).trim();
      }
    }
    if (currentActs.length === 0) continue;

    text = text.replace(/^[-–—:]\s*/, "").trim();

    // "complete" / "" / "(read)" with no labels means the whole act.
    if (!text || /^(complete|all|entire|full)\b/i.test(text)) {
      for (const act of currentActs) specs.push({ act, mode: "all" });
      continue;
    }

    // Trailing prose after a dash describes the work, not a scene.
    const dash = text.search(/\s[-–—]\s/);
    if (dash >= 0) text = text.slice(0, dash).trim();
    text = text.replace(/\([^)]*\)/g, " ").trim();

    const range = text.match(/^(.+?)\s+(?:through|thru|to)\s+(.+)$/i);
    if (range) {
      const from = normalizeLabel(range[1]);
      const to = normalizeLabel(range[2]);
      if (from && to) {
        for (const act of currentActs) specs.push({ act, mode: "range", from, to });
        continue;
      }
    }

    for (const piece of text.split(/,|\band\b/i)) {
      const label = normalizeLabel(piece);
      if (!label) continue;
      for (const act of currentActs) specs.push({ act, mode: "label", label });
    }
  }
  return specs;
}

function scenesFor(specs: SceneSpec[], scenes: CurriculumScene[]): string[] {
  const ids: string[] = [];
  const inAct = (act: string) =>
    scenes.filter(
      (s) => s.kind === "scene" && String(s.act ?? "").toUpperCase() === act
    );

  for (const spec of specs) {
    const pool = inAct(spec.act);
    if (spec.mode === "all") {
      for (const s of pool) ids.push(s.id);
      continue;
    }
    if (spec.mode === "label") {
      const hit = pool.find((s) => s.label === spec.label);
      if (hit) ids.push(hit.id);
      continue;
    }
    // Range: the workbook's own order is the authority on what lies between.
    const from = pool.findIndex((s) => s.label === spec.from);
    const to = pool.findIndex((s) => s.label === spec.to);
    if (from < 0 || to < 0) continue;
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    for (let i = lo; i <= hi; i++) ids.push(pool[i].id);
  }
  return ids;
}

/* ── song references ────────────────────────────────────────────────────── */

/**
 * Song titles carry their running number in the curriculum ("12. The Contest")
 * and never on the calendar, so the number comes off before comparing. The
 * comparison is deliberately strict beyond that: a near-miss on a song title
 * silently attributes a rehearsal to the wrong number, and a reported miss is
 * cheaper to fix than a wrong date nobody notices.
 */
export function normalizeTitle(value: string): string {
  return value
    .replace(/^\s*\d+\.\s*/, "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function songTitlesFrom(value: string): string[] {
  return value
    .split(";")
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
}

/* ── the build ──────────────────────────────────────────────────────────── */

const FIELD: Record<WorkKind, keyof CurriculumDates> = {
  music: "music_dates",
  blocking: "blocking_dates",
  staging: "staging_dates",
  run: "run_dates",
};

/** "8/24" — the calendar's own shorthand, in the org's timezone. */
function shortDate(startsAt: string): string {
  return formatInTimeZone(new Date(startsAt), org.timeZone, "M/d");
}

function sortDates(dates: Set<string>): string | null {
  if (dates.size === 0) return null;
  const ordered = [...dates].sort((a, b) => {
    const [am, ad] = a.split("/").map(Number);
    const [bm, bd] = b.split("/").map(Number);
    return am - bm || ad - bd;
  });
  return ordered.join(", ");
}

/**
 * Rebuild every scene's four date columns from the calls that name it.
 *
 * A scene no call mentions comes back with nulls. That is the point of a
 * rebuild rather than a merge: the calendar is the source of truth, so a scene
 * dropped from the schedule stops claiming dates it no longer has.
 *
 * A song named on a Music: line was sung that day, so it takes the music
 * column — unless the whole call is a run, when everything in it is a run.
 * A scene takes the call's own kind, and a call whose kind cannot be read
 * contributes nothing rather than landing in the wrong column.
 */
export function buildCurriculum(
  events: WorkedEvent[],
  scenes: CurriculumScene[]
): CurriculumBuild {
  const buckets = new Map<string, Record<WorkKind, Set<string>>>();
  for (const scene of scenes) {
    buckets.set(scene.id, {
      music: new Set(),
      blocking: new Set(),
      staging: new Set(),
      run: new Set(),
    });
  }
  const songs = scenes.filter((s) => s.kind === "song");
  const byTitle = new Map(songs.map((s) => [normalizeTitle(s.name), s.id]));

  const unclassified: CurriculumBuild["unclassified"] = [];
  const unmatched: CurriculumBuild["unmatched"] = [];
  const silent: CurriculumBuild["silent"] = [];

  for (const event of events) {
    const sceneValues = valuesFor(event.description, "Scene");
    const musicValues = valuesFor(event.description, "Music");
    const pageValues = pageValuesFor(event.description);
    const date = shortDate(event.startsAt);

    if (sceneValues.length === 0 && musicValues.length === 0 && pageValues.length === 0) {
      silent.push({ date, title: event.title });
      continue;
    }

    const kind = workKindFor(event);
    if (!kind) {
      unclassified.push({ date, title: event.title });
      continue;
    }
    const songKind: WorkKind = kind === "run" ? "run" : "music";

    for (const value of sceneValues) {
      const ids = scenesFor(sceneSpecsFrom(value), scenes);
      if (ids.length === 0) unmatched.push({ date, line: "Scene", value });
      for (const id of ids) buckets.get(id)?.[kind].add(date);
    }

    for (const value of musicValues) {
      for (const title of songTitlesFrom(value)) {
        const id = byTitle.get(normalizeTitle(title));
        if (!id) {
          unmatched.push({ date, line: "Music", value: title });
          continue;
        }
        buckets.get(id)?.[songKind].add(date);
      }
    }

    // A page run stands in for both lines at once: the scenes it crosses take
    // the call's own kind, the numbers it crosses are sung, so they follow the
    // same rule a Music: line would.
    for (const value of pageValues) {
      const ranges = pageRangesFrom(value);
      const ids = ranges.length > 0 ? pagesTouch(ranges, scenes) : [];
      if (ids.length === 0) {
        unmatched.push({ date, line: "Pages", value });
        continue;
      }
      for (const id of ids) {
        const scene = scenes.find((s) => s.id === id);
        buckets.get(id)?.[scene?.kind === "song" ? songKind : kind].add(date);
      }
    }
  }

  const bySceneId = new Map<string, CurriculumDates>();
  for (const [id, sets] of buckets) {
    bySceneId.set(id, {
      music_dates: sortDates(sets.music),
      blocking_dates: sortDates(sets.blocking),
      staging_dates: sortDates(sets.staging),
      run_dates: sortDates(sets.run),
    });
  }
  return { bySceneId, unclassified, unmatched, silent };
}

export const CURRICULUM_FIELDS = FIELD;
