import { NextResponse } from "next/server";

/**
 * TEMPORARY diagnostic endpoint for the novapa cutover (2026-08-15).
 * Reports env-var PRESENCE (never values) and probes the database from the
 * deployed runtime. Token-gated; delete this file once login works live.
 */

const TOKEN = "fh-cutover-debug-7Qm2xVt9";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== TOKEN) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const env = process.env;
  const report: Record<string, unknown> = {
    mode: env.NEXT_PUBLIC_DATA_MODE ?? "(unset)",
    urlHost: env.NEXT_PUBLIC_SUPABASE_URL?.replace("https://", "").split(".")[0] ?? "(unset)",
    anonKeyPrefix: env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 15) ?? "(unset)",
    serviceKeySet: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    serviceKeyPrefix: env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 10) ?? "(unset)",
    serviceKeyLength: env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0,
    sessionSecretSet: Boolean(env.SESSION_SECRET),
    schema: env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "(unset → family_hub)",
    bucketPrefix: env.SUPABASE_BUCKET_PREFIX ?? "(unset → fh-)",
    nodeVersion: process.version,
  };

  try {
    const { getServiceClient } = await import("@/lib/api/supabase/client");
    const { count, error } = await getServiceClient()
      .from("profiles")
      .select("id", { count: "exact", head: true });
    report.dbProbe = error ? `ERROR: ${error.message}` : `ok, ${count} profiles`;
  } catch (error) {
    report.dbProbe = `THREW: ${error instanceof Error ? error.message : String(error)}`;
  }

  return NextResponse.json(report);
}
