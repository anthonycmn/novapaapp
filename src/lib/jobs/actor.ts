import { getProvider } from "@/lib/api";
import { getServiceClient } from "@/lib/api/supabase/client";

/**
 * Whose permissions an unattended job runs with.
 *
 * The email queue learned this the hard way: a hardcoded dana@example.com —
 * a seed address with no production profile — made every cron run return
 * "No job account" and silently turned the queue off. The registration
 * webhook had the same address baked in, so it was dead the same way.
 *
 * JOB_ACTOR_EMAIL names a service account when somebody wants one. Without
 * it, the lowest-numbered super_admin: the one role certain to be allowed to
 * do everything a job needs, ordered so the choice is stable rather than
 * whatever Postgres returns first today.
 */
export async function jobActorId(): Promise<string | null> {
  const named = process.env.JOB_ACTOR_EMAIL?.trim();
  if (named) {
    const user = await getProvider().getUserByEmail(named);
    if (user) return user.id;
  }
  const { data } = await getServiceClient()
    .from("profiles")
    .select("id")
    .eq("role", "super_admin")
    .order("id")
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
