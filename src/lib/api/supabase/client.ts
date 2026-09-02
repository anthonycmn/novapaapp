import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase clients for the shared `novapa` project.
 * The family hub owns the `family_hub` schema — never `public` (the
 * website's registration/ticketing tables) and never `staff_portal`
 * (the portal's). NEXT_PUBLIC_SUPABASE_SCHEMA exists only for running
 * against the frozen novapa-deh rehearsal copy, where the family hub
 * historically lived in `public`.
 *
 * The adapter uses the service-role client and enforces authorization in
 * TypeScript (mirroring the mock provider, so the whole test suite keeps
 * meaning something). RLS remains enabled on every table as defense in
 * depth for anything that reaches PostgREST directly with the anon key.
 */

let serviceClient: SupabaseClient | null = null;

/** The schema the family hub's tables live in. */
export function getSupabaseSchema(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "family_hub";
}

export function getServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. See NEEDS-FROM-TONY.md #1."
    );
  }
  // Cast: the schema name is dynamic, so supabase-js can't carry it in the type.
  serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: getSupabaseSchema() },
  }) as unknown as SupabaseClient;
  return serviceClient;
}

let websiteReadClient: SupabaseClient | null = null;

/**
 * A read-only window onto the website's `public` schema, where the org's
 * real registration data lives (families, campers, orders, cast roster).
 * The website owns those tables: the family hub ONLY EVER SELECTS through
 * this client. All family-hub writes go through getServiceClient(), which
 * is pinned to the family_hub schema and cannot touch these tables.
 */
export function getWebsiteReadClient(): SupabaseClient {
  if (websiteReadClient) return websiteReadClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
    );
  }
  websiteReadClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  });
  return websiteReadClient;
}

let portalReadClient: SupabaseClient | null = null;

/**
 * A read-only window onto the STAFF PORTAL's schema, used solely by the
 * schedule bridge to mirror the season plan (production_schedule,
 * season_events, curriculum links) into family-hub calendar events.
 * The portal owns those tables: ONLY EVER SELECT through this client.
 */
export function getPortalReadClient(): SupabaseClient {
  if (portalReadClient) return portalReadClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
    );
  }
  portalReadClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "staff_portal" },
  }) as unknown as SupabaseClient;
  return portalReadClient;
}

let portalRpcClient: SupabaseClient | null = null;

/**
 * The ONE way the family hub changes anything the staff portal owns.
 *
 * `getPortalReadClient` promises, in writing, only ever to SELECT, and that
 * promise is worth keeping — so coaching bookings do not quietly break it.
 * They come through here instead, and this client may call exactly these
 * functions and no others:
 *
 *   staff_portal.family_book_coaching             — book one session (0153)
 *   staff_portal.family_cancel_coaching           — cancel their own (0153)
 *   staff_portal.family_coaching_summary          — balance and diary (0153)
 *   staff_portal.family_start_coaching_purchase   — reserve a purchase (0154)
 *   staff_portal.family_complete_coaching_purchase — credit it once paid (0154)
 *   staff_portal.coaching_session_notice          — what to say about one
 *                                                   booking, read fresh (0211)
 *   staff_portal.coaching_purchase_notice         — the same, for a receipt (0211)
 *   staff_portal.log_coaching_notice              — file what was sent in the
 *                                                   family's mail history (0211)
 *
 * The last three exist for messages sent AFTER the fact. They read names and
 * counts back out at the moment of writing and record what went out; none of
 * them can move a booking or a balance.
 *
 * NEVER add a table write here. Each of those functions re-checks that the
 * student belongs to the family it was handed, so an authorisation bug in
 * this app cannot book or read another family's child; a bare insert would
 * throw that protection away. If something new needs writing, it gets its own
 * function in the portal, with its own checks, and gets listed above.
 *
 * They are granted to `service_role` alone, so a parent's browser cannot
 * reach them with a family id that is not theirs.
 */
export function getPortalRpcClient(): SupabaseClient {
  if (portalRpcClient) return portalRpcClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
    );
  }
  portalRpcClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "staff_portal" },
  }) as unknown as SupabaseClient;
  return portalRpcClient;
}

/** True when enough configuration exists to talk to Supabase at all. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
