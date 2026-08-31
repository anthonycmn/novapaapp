import { ICAL_FEEDS, type IcalFeed } from "@/config/ical-feeds";
import { parseIcal } from "@/lib/ical/parse";
import { rowFor, roleIdsFromCalledNote, blockSheetFrom } from "@/lib/ical/map";
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
  // The curriculum's own song titles, so the free-form reader can tell a
  // number from a character without a second list to keep in step.
  const { data: songRows } = await hub
    .from("show_scenes")
    .select("name")
    .eq("production_id", feed.productionId)
    .eq("kind", "song");
  const songTitles = (songRows ?? []).map((row) => String(row.name ?? ""));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Format A first — a labelled call sheet says exactly what it means. Only
    // when there is none do we read the free-form block lines.
    if (!row.called_note || !row.works_note) {
      const sheet = blockSheetFrom(
        events[i].description ?? "",
        roles ?? [],
        feed.roleAliases,
        feed.staffNames,
        songTitles
      );
      if (!row.called_note && sheet.called.length > 0) {
        row.called_note = sheet.called.join(" · ");
      }
      if (!row.works_note) {
        const note = [
          ...sheet.pages.map((run) => `Pages ${run}`),
          ...sheet.prose,
        ].join(" · ");
        if (note) row.works_note = note;
      }
    }
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

  return base;
}

export async function syncIcalFeeds(): Promise<IcalSyncResult> {
  const feeds: IcalFeedResult[] = [];
  for (const feed of ICAL_FEEDS) {
    feeds.push(await syncFeed(feed));
  }
  return { feeds };
}
