import { ICAL_FEEDS, type IcalFeed } from "@/config/ical-feeds";
import { parseIcal } from "@/lib/ical/parse";
import { rowFor, roleIdsFromCalledNote } from "@/lib/ical/map";
import {
  buildCurriculum,
  type CurriculumScene,
  type WorkedEvent,
} from "@/lib/ical/curriculum";
import { getServiceClient } from "@/lib/api/supabase/client";

/**
 * Pull each configured iCal feed into family_hub.calendar_events.
 *
 * Reconciliation is keyed on the iCal UID, held in external_ref, scoped to
 * external_source = the feed key. So the job owns exactly its own rows:
 *   - a new VEVENT is inserted
 *   - a changed VEVENT is updated in place, and a moved time gets a change
 *     note so the rail can flag it to families
 *   - a VEVENT that disappeared upstream is deleted
 *
 * That last one is the point. Tony edits the Google calendar; within the hour
 * the portal matches it, cancellations included. Nobody re-runs a script.
 */

export interface IcalFeedResult {
  key: string;
  productionId: string;
  parsed: number;
  inserted: number;
  updated: number;
  removed: number;
  withCallTime: number;
  skipped?: string;
  /** What the same pass rebuilt in family_hub.show_scenes. */
  curriculum?: CurriculumReport;
}

/**
 * The curriculum rebuild, reported rather than logged.
 *
 * The counts that matter here are the misses. A call with no Scene:/Music: line
 * is not an error — it is a call whose curriculum nobody has written yet — and
 * the only way that ever gets fixed is by somebody seeing the number.
 */
export interface CurriculumReport {
  scenes: number;
  /** Scenes whose date columns actually moved this run. */
  changed: number;
  /** Calls carrying no Scene:/Music: line at all. */
  silent: Array<{ date: string; title: string }>;
  /** Calls whose kind of work could not be read from the title. */
  unclassified: Array<{ date: string; title: string }>;
  /** Scene:/Music: text matching no row in the curriculum. */
  unmatched: Array<{ date: string; line: string; value: string }>;
  skipped?: string;
}

export interface IcalSyncResult {
  feeds: IcalFeedResult[];
}

type Row = Record<string, unknown>;

/** A parsed VEVENT plus the roles its call sheet resolved to. */
type FeedRow = ReturnType<typeof rowFor> & { role_ids?: string[] | null };

function sameInstant(a: unknown, b: string): boolean {
  return Date.parse(String(a)) === Date.parse(b);
}

function sameIdSet(a: unknown, b: string[] | null): boolean {
  const left = ((a ?? []) as string[]).map(String).sort().join(",");
  const right = (b ?? []).map(String).sort().join(",");
  return left === right;
}


/**
 * Rebuild family_hub.show_scenes date columns from the calls just synced.
 *
 * Runs in the same pass as the events for the reason the call sheet does: two
 * writers on one show's schedule means the curriculum and the calendar can
 * disagree, and the family-facing scene list is read straight off this table.
 *
 * Writes ONLY the four date columns. A production with no curriculum rows is
 * skipped rather than seeded — the scene list is the workbook's, and inventing
 * one from calendar shorthand would be worse than having none.
 */
async function rebuildCurriculum(
  feed: IcalFeed,
  worked: WorkedEvent[],
  hub: ReturnType<typeof getServiceClient>
): Promise<CurriculumReport> {
  const { data: scenes, error } = await hub
    .from("show_scenes")
    .select(
      "id, kind, act, label, name, from_page, to_page, music_dates, blocking_dates, staging_dates, run_dates"
    )
    .eq("production_id", feed.productionId)
    .order("sort_order");
  if (error) throw new Error(`${feed.key}: scenes read failed: ${error.message}`);

  const rows = (scenes ?? []) as Row[];
  const empty: CurriculumReport = {
    scenes: 0,
    changed: 0,
    silent: [],
    unclassified: [],
    unmatched: [],
  };
  if (rows.length === 0) {
    return { ...empty, skipped: "no curriculum rows for this production" };
  }

  const build = buildCurriculum(
    worked,
    rows.map((row) => ({
      id: String(row.id),
      kind: row.kind === "song" ? "song" : "scene",
      act: row.act as string | null,
      label: row.label as string | null,
      name: String(row.name ?? ""),
      fromPage: row.from_page as number | null,
      toPage: row.to_page as number | null,
    })) satisfies CurriculumScene[]
  );

  let changed = 0;
  for (const row of rows) {
    const next = build.bySceneId.get(String(row.id));
    if (!next) continue;
    const moved =
      String(row.music_dates ?? "") !== String(next.music_dates ?? "") ||
      String(row.blocking_dates ?? "") !== String(next.blocking_dates ?? "") ||
      String(row.staging_dates ?? "") !== String(next.staging_dates ?? "") ||
      String(row.run_dates ?? "") !== String(next.run_dates ?? "");
    if (!moved) continue;

    const { error: updateError } = await hub
      .from("show_scenes")
      .update(next)
      .eq("id", row.id as string);
    if (updateError) {
      throw new Error(`${feed.key}: curriculum update failed: ${updateError.message}`);
    }
    changed++;
  }

  return {
    scenes: rows.length,
    changed,
    silent: build.silent,
    unclassified: build.unclassified,
    unmatched: build.unmatched,
  };
}

async function syncFeed(feed: IcalFeed): Promise<IcalFeedResult> {
  const base: IcalFeedResult = {
    key: feed.key,
    productionId: feed.productionId,
    parsed: 0,
    inserted: 0,
    updated: 0,
    removed: 0,
    withCallTime: 0,
  };

  if (!feed.url) {
    return { ...base, skipped: "no feed URL configured in the environment" };
  }

  const response = await fetch(feed.url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${feed.key}: calendar fetch failed with ${response.status}`);
  }
  const events = parseIcal(await response.text());
  const rows: FeedRow[] = events.map((event) => ({ ...rowFor(event, feed) }));

  // The curriculum needs the raw description, which rowFor deliberately does
  // not keep; zip it back on here while both are still in hand.
  const worked: WorkedEvent[] = rows.map((row, i) => ({
    startsAt: row.starts_at,
    title: row.title,
    type: row.type,
    description: events[i].description ?? "",
  }));
  base.parsed = rows.length;
  base.withCallTime = rows.filter((row) => row.call_time).length;

  // A feed that suddenly parses to nothing is far more likely to be a fetch
  // or format problem than a canceled season. Deleting the whole calendar on
  // that basis is not a risk worth taking unattended.
  if (rows.length === 0) {
    return { ...base, skipped: "feed parsed to zero events; refusing to clear the calendar" };
  }

  const hub = getServiceClient();

  // Resolve the call sheet to roles in the same pass that writes the prose,
  // so the two can never describe different casts.
  const { data: roles, error: rolesError } = await hub
    .from("show_roles")
    .select("id, name")
    .eq("production_id", feed.productionId);
  if (rolesError) throw new Error(`${feed.key}: roles read failed: ${rolesError.message}`);
  for (const row of rows) {
    row.role_ids = roleIdsFromCalledNote(row.called_note, roles ?? [], feed.roleAliases);
  }

  const { data: existing, error: readError } = await hub
    .from("calendar_events")
    .select("id, external_ref, title, type, starts_at, ends_at, location, call_time, called_note, works_note, role_ids")
    .eq("external_source", feed.key)
    .eq("production_id", feed.productionId);
  if (readError) throw new Error(`${feed.key}: events read failed: ${readError.message}`);

  const byRef = new Map(
    (existing ?? []).map((row) => [String(row.external_ref), row as Row])
  );

  const inserts: FeedRow[] = [];
  for (const row of rows) {
    const current = byRef.get(row.external_ref);
    if (!current) {
      inserts.push(row);
      base.inserted++;
      continue;
    }
    byRef.delete(row.external_ref);

    const timeMoved =
      !sameInstant(current.starts_at, row.starts_at) ||
      !sameInstant(current.ends_at, row.ends_at);
    const changed =
      timeMoved ||
      String(current.title) !== row.title ||
      String(current.type) !== row.type ||
      String(current.location ?? "") !== row.location ||
      String(current.called_note ?? "") !== String(row.called_note ?? "") ||
      !sameIdSet(current.role_ids, row.role_ids ?? null) ||
      String(current.works_note ?? "") !== String(row.works_note ?? "") ||
      Date.parse(String(current.call_time ?? "")) !==
        Date.parse(String(row.call_time ?? ""));
    if (!changed) continue;

    const { error } = await hub
      .from("calendar_events")
      .update({
        ...row,
        // Families need to know a call moved, not just that it is different
        // from what they wrote down.
        ...(timeMoved
          ? {
              changed_at: new Date().toISOString(),
              change_note: "Updated from the show calendar",
            }
          : {}),
      })
      .eq("id", current.id as string);
    if (error) throw new Error(`${feed.key}: update failed: ${error.message}`);
    base.updated++;
  }

  for (let i = 0; i < inserts.length; i += 400) {
    const { error } = await hub
      .from("calendar_events")
      .insert(inserts.slice(i, i + 400));
    if (error) throw new Error(`${feed.key}: insert failed: ${error.message}`);
  }

  // Whatever is still in byRef was removed from the calendar upstream.
  for (const [, row] of byRef) {
    const { error } = await hub
      .from("calendar_events")
      .delete()
      .eq("id", row.id as string);
    if (error) throw new Error(`${feed.key}: delete failed: ${error.message}`);
    base.removed++;
  }

  base.curriculum = await rebuildCurriculum(feed, worked, hub);
  return base;
}

export async function syncIcalFeeds(): Promise<IcalSyncResult> {
  const feeds: IcalFeedResult[] = [];
  for (const feed of ICAL_FEEDS) {
    feeds.push(await syncFeed(feed));
  }
  return { feeds };
}
