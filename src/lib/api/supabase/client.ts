import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase clients for the shared novapa-deh project.
 * The family hub owns the `public` schema; the staff portal owns
 * `staff_portal` and this app NEVER queries it.
 *
 * The adapter uses the service-role client and enforces authorization in
 * TypeScript (mirroring the mock provider, so the whole test suite keeps
 * meaning something). RLS remains enabled on every table as defense in
 * depth for anything that reaches PostgREST directly with the anon key.
 */

let serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. See NEEDS-FROM-TONY.md #1."
    );
  }
  serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

/** True when enough configuration exists to talk to Supabase at all. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
