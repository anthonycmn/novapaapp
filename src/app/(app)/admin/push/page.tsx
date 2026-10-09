import { redirect } from "next/navigation";
import { BellRing } from "lucide-react";
import { pushReach } from "@/lib/push/broadcast";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { PushComposer } from "./composer";

export const metadata = { title: "Push to all parents" };

/**
 * Push to every parent (CJ, 8 Oct 2026). The staff portal has the same
 * composer, through /api/push/broadcast (9 Oct 2026).
 */
export default async function PushBroadcastPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "admin")) redirect("/admin");

  const numbers = await pushReach();

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
