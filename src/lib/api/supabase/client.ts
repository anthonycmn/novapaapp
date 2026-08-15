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

/** True when enough configuration exists to talk to Supabase at all. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
