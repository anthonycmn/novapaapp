import "server-only";
import { getPortalReadClient, getServiceClient } from "@/lib/api/supabase/client";
import { ICAL_FEEDS, type IcalFeed } from "@/config/ical-feeds";

/**
 * Where the calendar feeds actually come from, since 5 Sep 2026.
 *
 * CJ: "make sure that this is completely thorough because we're about to
 * launch this same feature for every single show that we're doing throughout
 * the year." A feed per show cannot mean a code change per show. The staff
 * portal already keeps one row per connected calendar in
 * staff_portal.production_calendar_feeds — the secret ICS address, behind
 * can_write(), never sent to a browser — so that row is now the single place
 * a show's calendar is configured, and BOTH syncs read it: the portal's
 * curriculum sync directly, and this app through here.
 *
 * The bridge from a portal production to the hub's is production_portal_link,
 * the same read-only mapping everything else crosses on. The per-feed knobs
 * the hub needs (title prefix, role aliases, staff names, address rewrites)
 * ride along in the row's hub_settings jsonb, so connecting Frozen KIDS is:
 * paste the calendar's secret address on the show page, done.
 *
 * The static ICAL_FEEDS list survives as defaults and as the fallback when
 * the portal cannot be read — a family calendar that stops syncing because a
 * config read failed would be the worse failure. A database row for the same
 * hub production always wins over the static entry.
 */

interface FeedRow {
  production_id: string;
  ics_url: string;
  calendar_name: string | null;
  hub_settings: HubSettings | null;
}

/** The hub's half of a feed row, stored as plain JSON on the portal row. */
interface HubSettings {
  /** calendar_events.external_source — the sync's ownership key. Stable forever. */
  key?: string;
  /** Literal text stripped off event titles, e.g. "Sweeney Todd". */
  title_prefix?: string;
  role_aliases?: Record<string, string>;
  staff_names?: string[];
  location_rewrites?: Array<{ when: string; use: string }>;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "Sweeney Todd" → a case-insensitive ^-anchored prefix-plus-dash matcher. */
function prefixRegExp(prefix: string | null | undefined): RegExp | undefined {
  const text = (prefix ?? "").trim();
  if (!text) return undefined;
  return new RegExp(`^${escapeRegExp(text)}\\s*[-–—:]\\s*`, "i");
}

function feedFromRow(
  row: FeedRow,
  hubProductionId: string,
  portalTitle: string | undefined
): IcalFeed {
  const settings = row.hub_settings ?? {};
  return {
    // The key scopes which calendar_events rows this feed owns; changing it
    // orphans every event the old key wrote. The portal production id is the
    // one stable name a row has, so it is the default.
    key: settings.key || `gcal_${row.production_id}`,
    productionId: hubProductionId,
    url: row.ics_url,
    titlePrefix: prefixRegExp(settings.title_prefix ?? row.calendar_name),
    roleAliases: settings.role_aliases ?? {},
    staffNames: settings.staff_names ?? [],
    portalTitle,
    portalProductionId: row.production_id,
    locationRewrites: (settings.location_rewrites ?? [])
      .filter((rule) => rule && rule.when && rule.use)
      .map((rule) => ({ when: new RegExp(rule.when, "i"), use: rule.use })),
  };
}

export async function loadIcalFeeds(): Promise<IcalFeed[]> {
  const byProduction = new Map<string, IcalFeed>();
  for (const feed of ICAL_FEEDS) byProduction.set(feed.productionId, feed);

  try {
    const portal = getPortalReadClient();
    const hub = getServiceClient();
    const [{ data: rows, error }, { data: links }, { data: titles }] = await Promise.all([
      portal
        .from("production_calendar_feeds")
        .select("production_id, ics_url, calendar_name, hub_settings"),
      hub.from("production_portal_link").select("hub_production_id, portal_production_id"),
      portal.from("productions").select("id, title"),
    ]);
    if (error) throw new Error(error.message);

    const titleById = new Map(
      (titles ?? []).map((p) => [String(p.id), String(p.title ?? "")])
    );
    for (const row of (rows ?? []) as FeedRow[]) {
      if (!row.ics_url) continue;
      const hubIds = (links ?? [])
        .filter((l) => String(l.portal_production_id) === String(row.production_id))
        .map((l) => String(l.hub_production_id))
        .sort();
      for (const hubId of hubIds) {
        const feed = feedFromRow(row, hubId, titleById.get(String(row.production_id)));
        // One portal show feeding several hub bands needs a distinct ownership
        // key per band, or the second band's sync deletes the first band's
        // rows. The first (sorted) band keeps the bare key for continuity.
        if (hubIds.length > 1 && hubId !== hubIds[0]) {
          feed.key = `${feed.key}_${hubId.slice(0, 8)}`;
        }
        byProduction.set(hubId, feed);
      }
    }
  } catch (error) {
    // The static list still stands; a config-read failure must not stop the
    // Sweeney calendar from syncing.
    console.error("[ical-feeds] falling back to the static feed list", error);
  }

  return [...byProduction.values()];
}

/** Production ids the portal season-plan sync must leave alone. */
export async function icalOwnedProductionIds(): Promise<Set<string>> {
  const feeds = await loadIcalFeeds();
  return new Set(feeds.map((feed) => feed.productionId));
}
