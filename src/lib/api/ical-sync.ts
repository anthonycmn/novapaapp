import { ICAL_FEEDS, type IcalFeed } from "@/config/ical-feeds";
import { parseIcal, type IcalEvent } from "@/lib/ical/parse";
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

/**
 * Performances are what families buy tickets for and plan around, so they are
 * typed differently from calls. "No rehearsal" markers are neither.
 */
export function eventTypeFor(summary: string): string {
  const s = summary.toLowerCase();
  if (/no rehearsal|no call|off book deadline/.test(s)) return "other";
  if (/opening night|matinee|closing performance|performance/.test(s)) return "performance";
  if (/\bevening\b/.test(s) && /curtain/.test(s)) return "performance";
  if (/tech|cue to cue|dry tech|wet tech/.test(s)) return "tech";
  if (/photo|headshot/.test(s)) return "photo_call";
  if (/fitting|costume measure/.test(s)) return "fitting";
  return "rehearsal";
}

export function cleanTitle(summary: string, prefix?: RegExp): string {
  const stripped = prefix ? summary.replace(prefix, "").trim() : summary.trim();
  return stripped || summary;
}

/**
 * The calendar states call times inside the title — "(call 12:30, curtain
 * 2:00)". Surface that as a real field so the rail can say "be there by".
 *
 * Both times are on a 12-hour clock and every performance is afternoon or
 * evening, so an hour under 8 means PM. Without that, "call 12:30, curtain
 * 2:00" reads as curtain being ten hours BEFORE the call and the matinees
 * silently lose their call time — four of the seven shows.
 */
export function callTimeFor(summary: string, startIso: string): string | null {
  const call = summary.match(/call\s*(\d{1,2}):(\d{2})/i);
  const curtain = summary.match(/curtain\s*(\d{1,2}):(\d{2})/i);
  if (!call || !curtain) return null;
  const pm = (h: number) => (h < 8 ? h + 12 : h);
  const callMins = pm(Number(call[1])) * 60 + Number(call[2]);
  const curtainMins = pm(Number(curtain[1])) * 60 + Number(curtain[2]);
  const diff = curtainMins - callMins;
  if (diff <= 0 || diff > 6 * 60) return null;
  return new Date(new Date(startIso).getTime() - diff * 60_000).toISOString();
}

export function rowFor(event: IcalEvent, feed: IcalFeed) {
  return {
    type: eventTypeFor(event.summary),
    title: cleanTitle(event.summary, feed.titlePrefix),
    starts_at: event.start,
    ends_at: event.end,
    call_time: callTimeFor(event.summary, event.start),
    location: event.location ?? "",
    production_id: feed.productionId,
    external_source: feed.key,
    external_ref: event.uid,
  };
}

type Row = Record<string, unknown>;

function sameInstant(a: unknown, b: string): boolean {
  return Date.parse(String(a)) === Date.parse(b);
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
  const rows = events.map((event) => rowFor(event, feed));
  base.parsed = rows.length;
  base.withCallTime = rows.filter((row) => row.call_time).length;

  // A feed that suddenly parses to nothing is far more likely to be a fetch
  // or format problem than a cancelled season. Deleting the whole calendar on
  // that basis is not a risk worth taking unattended.
  if (rows.length === 0) {
    return { ...base, skipped: "feed parsed to zero events; refusing to clear the calendar" };
  }

  const hub = getServiceClient();
  const { data: existing, error: readError } = await hub
    .from("calendar_events")
    .select("id, external_ref, title, type, starts_at, ends_at, location, call_time")
    .eq("external_source", feed.key)
    .eq("production_id", feed.productionId);
  if (readError) throw new Error(`${feed.key}: events read failed: ${readError.message}`);

  const byRef = new Map(
    (existing ?? []).map((row) => [String(row.external_ref), row as Row])
  );

  const inserts: Row[] = [];
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
