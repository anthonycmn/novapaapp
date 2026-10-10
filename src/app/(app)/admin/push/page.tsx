import { redirect } from "next/navigation";
import { BellRing } from "lucide-react";
import { pushAudienceOptions, pushReach } from "@/lib/push/broadcast";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { PushComposer } from "./composer";

export const metadata = { title: "Push to parents" };

/**
 * Push to every parent (CJ, 8 Oct 2026). The staff portal has the same
 * composer, through /api/push/broadcast (9 Oct 2026). Every parent, or the
 * families enrolled in the shows, classes, and programs picked (10 Oct 2026).
 */
export default async function PushBroadcastPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "admin")) redirect("/admin");

  const [everyone, options] = await Promise.all([pushReach(), pushAudienceOptions()]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <BellRing aria-hidden className="size-6" />
          Push to parents
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lands in the notification bell of every parent it goes to - everyone, or
          the families in the shows and classes you pick - and rings every phone or
          computer that has notifications turned on.
        </p>
      </div>

      <PushComposer everyone={everyone} options={options} />
    </div>
  );
}
