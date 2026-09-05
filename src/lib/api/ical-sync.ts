import { type IcalFeed } from "@/config/ical-feeds";
import { loadIcalFeeds } from "@/lib/ical/feeds";
import { parseIcal } from "@/lib/ical/parse";
import {
  rowFor,
  roleIdsFromCalledNote,
  blockSheetFrom,
  isCompanyCallTitle,
  everyRoleName,
} from "@/lib/ical/map";
import {
  callsForEvent,
  overlayFor,
  type EventWindow,
  type PortalCall,
} from "@/lib/ical/portal-calls";
import { getPortalReadClient, getServiceClient } from "@/lib/api/supabase/client";

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

/**
 * Like sameInstant, but where BOTH sides may be null — call_time usually is.
 * Comparing two nulls through Date.parse gives NaN !== NaN, which read every
 * row without a call time as "changed" and silently rewrote 109 rows per
 * sync, forever. Steady state must cost zero writes.
 */
function sameNullableInstant(a: unknown, b: string | null): boolean {
  const left = a == null || a === "" ? null : Date.parse(String(a));
  const right = b == null || b === "" ? null : Date.parse(b);
  return left === right;
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

  /*
   * The staff portal's curriculum for this same show, if it keeps one.
   *
   * Read once for the whole feed rather than per event, and read READ-ONLY —
   * getPortalReadClient promises in writing never to do anything else. A show
   * with no portalTitle, or a portal that cannot be reached, simply leaves
   * this empty and the feed's own prose stands.
   */
  let portalCalls: PortalCall[] = [];
  if (feed.portalProductionId || feed.portalTitle) {
    try {
      const portal = getPortalReadClient();
      let portalProductionId = feed.portalProductionId;
      if (!portalProductionId && feed.portalTitle) {
        const { data: production } = await portal
          .from("productions")
          .select("id")
          .eq("title", feed.portalTitle)
          .maybeSingle();
        portalProductionId = production?.id ? String(production.id) : undefined;
      }
      if (portalProductionId) {
        const { data } = await portal
          .from("curriculum_calls")
          .select(
            "call_date, starts_at, ends_at, call_type, room, staff_leading, act_scene, material, called, calendar_status"
          )
          .eq("production_id", portalProductionId)
          .order("call_date");
        portalCalls = (data ?? []) as PortalCall[];
      }
    } catch (error) {
      // The curriculum is an improvement on the feed, not a dependency of it.
      // A family calendar that stops updating because the portal is having a
      // bad afternoon would be a worse outcome than one without room detail.
      console.error(`${feed.key}: portal curriculum unavailable`, error);
    }
  }

  // Every timed window, so a call landing between two events on the same day
  // is handed to the right one rather than dropped — see callsForEvent.
  const dayWindows: EventWindow[] = rows.map((row) => ({
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    /*
     * Did the calendar itself state who is called? A labelled call sheet
     * ("CALLED — 11 of 12: …") is CJ speaking directly, and nothing below is
     * allowed to shrink it — the 3 Sep call said eleven names while the
     * curriculum still held the old workbook's seven, and families were shown
     * the seven.
     */
    const calendarStatedCast = Boolean(row.called_note);
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
        // A sheet that names the entire cast one by one — "Featured: Whole
        // company" on a show with 85 roles — reads better as two words than
        // as 85; the unresolvable phrase leaves role_ids null, which IS
        // "show this to everyone".
        row.called_note =
          sheet.called.length === (roles ?? []).length
            ? "Full company"
            : sheet.called.join(" · ");
      }
      if (!row.works_note) {
        /*
         * Only lines that read like labels. The Frozen calendars write whole
         * teaching paragraphs into their descriptions, and gluing those into
         * one rail note made it unreadable — the full text is on the row
         * anyway, as details. Short fragments and page runs are the summary.
         */
        const prose = sheet.prose.filter((part) => part.length <= 64).slice(0, 5);
        const note = [...sheet.pages.map((run) => `Pages ${run}`), ...prose].join(" · ");
        if (note) row.works_note = note;
      }
      // Last resort: a title that says FULL COMPANY in so many words. Several
      // calls carry it there and nowhere else — "COSTUME PARADE - FULL
      // COMPANY" has an empty description. Only the unambiguous phrase counts;
      // titles never yield individual characters, or the call titled "SWEENEY
      // TODD" would summon one boy to a rehearsal meant for the whole company.
      if (!row.called_note && isCompanyCallTitle(row.title)) {
        row.called_note = everyRoleName(roles ?? []).join(" · ");
      }
    }

    /*
     * The portal has the last word on who is called and what is worked —
     * EXCEPT against a cast list the calendar states in so many words.
     *
     * It splits this event into the rooms it is actually run as, and staff
     * correct it by hand — so when a cast changes on the staff side, this is
     * the line that carries it to families. It overrides rather than merges:
     * two accounts of who is called, stitched together, would be a third
     * account that neither side agreed to.
     *
     * The exception is CJ's rule of 5 Sep 2026: what he writes in the Google
     * calendar must reach families exactly. A description carrying its own
     * labelled CALLED list keeps it; the portal still contributes the room
     * detail of what is worked.
     */
    if (portalCalls.length > 0) {
      const overlay = overlayFor(
        callsForEvent(portalCalls, row.starts_at, row.ends_at, undefined, dayWindows)
      );
      if (overlay.calledNote && !calendarStatedCast) row.called_note = overlay.calledNote;
      if (overlay.worksNote) row.works_note = overlay.worksNote;
    }

    row.role_ids = roleIdsFromCalledNote(row.called_note, roles ?? [], feed.roleAliases);
  }

  const { data: existing, error: readError } = await hub
    .from("calendar_events")
    .select("id, external_ref, title, type, starts_at, ends_at, location, call_time, called_note, works_note, details, role_ids")
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
      String(current.details ?? "") !== String(row.details ?? "") ||
      !sameNullableInstant(current.call_time, row.call_time);
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
  // The feed list lives in staff_portal.production_calendar_feeds now, so
  // connecting a show's calendar is a paste on the staff show page rather
  // than a code change — see src/lib/ical/feeds.ts.
  for (const feed of await loadIcalFeeds()) {
    feeds.push(await syncFeed(feed));
  }
  return { feeds };
}
