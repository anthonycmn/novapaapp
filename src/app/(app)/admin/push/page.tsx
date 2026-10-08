import { redirect } from "next/navigation";
import { BellRing } from "lucide-react";
import { getServiceClient, isSupabaseConfigured } from "@/lib/api/supabase/client";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { PushComposer } from "./composer";

export const metadata = { title: "Push to all parents" };

/**
 * Push to every parent (CJ, 8 Oct 2026).
 *
 * The two numbers on this page are the honest ones: every parent sees the
 * notice in their bell, but only the parents who turned push on for a
 * device get a phone that rings. Saying "sent to 823" and nothing else
 * would let CJ believe 823 phones lit up.
 */
async function reach(): Promise<{ parents: number; devices: number; parentsWithPush: number } | null> {
  if ((process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") !== "supabase" || !isSupabaseConfigured()) {
    return null;
  }
  const db = getServiceClient();
  const [{ data: parents }, { data: subs }] = await Promise.all([
    db.from("profiles").select("id").eq("role", "parent"),
    db.from("push_subscriptions").select("user_id"),
  ]);
  const parentIds = new Set((parents ?? []).map((p: { id: string }) => p.id));
  const parentSubs = (subs ?? []).filter((s: { user_id: string }) => parentIds.has(s.user_id));
  return {
    parents: parentIds.size,
    devices: parentSubs.length,
    parentsWithPush: new Set(parentSubs.map((s: { user_id: string }) => s.user_id)).size,
  };
}

export default async function PushBroadcastPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "admin")) redirect("/admin");

  const numbers = await reach();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <BellRing aria-hidden className="size-6" />
          Push to all parents
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lands in every parent&apos;s notification bell, and rings every phone or
          computer that has notifications turned on.
        </p>
      </div>

      {numbers && (
        <Card>
          <CardContent className="grid grid-cols-2 gap-3 py-4 text-sm">
            <div>
              <p className="text-2xl font-semibold">{numbers.parents}</p>
              <p className="text-muted-foreground">parents see it in their bell</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{numbers.parentsWithPush}</p>
              <p className="text-muted-foreground">
                get it on a phone or computer ({numbers.devices} devices)
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <PushComposer parentCount={numbers?.parents ?? null} />
    </div>
  );
}
