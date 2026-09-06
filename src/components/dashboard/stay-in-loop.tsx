import Link from "next/link";
import { ArrowRight, BellRing, CalendarPlus } from "lucide-react";
import { getServiceClient, isSupabaseConfigured } from "@/lib/api/supabase/client";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * The two features that make the portal worth opening weekly — the phone
 * calendar and push — had 39 and 1 adopters out of 258 enrolled families on
 * the day of the Sep 5 2026 audit, because nothing ever suggested them. This
 * card does, once: it renders only while the family has no calendar
 * subscription, and disappears forever the moment they set one up. A parent
 * who wants it gone sooner can remove the tile from the dashboard.
 *
 * "Subscription" is a FETCHED feed (last_fetched_at, stamped by the ICS
 * route, 0073) — not a token row, which getCalendarToken creates on any
 * visit to /schedule. Testing the row killed the nudge for exactly the
 * families it was built for (Sep 6 2026 review).
 */
export async function StayInLoopCard({ familyId }: { familyId: string }) {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data } = await getServiceClient()
      .from("family_calendar_tokens")
      .select("family_id, last_fetched_at")
      .eq("family_id", familyId)
      .maybeSingle();
    if (data?.last_fetched_at) return null; // a calendar app is polling — job done, card gone
  } catch {
    return null;
  }

  return (
    <Card pad={false}>
      <SectionHeader title="Get rehearsals on your phone" inCard />
      <div className="flex flex-col gap-2 p-4">
        <Link
          href="/schedule"
          className="flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted"
        >
          <CalendarPlus aria-hidden size={17} className="mt-0.5 shrink-0 text-gold" />
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-[13.5px] font-medium">
              Add the schedule to your calendar app
              <ArrowRight aria-hidden size={13} className="text-muted-foreground" />
            </span>
            <span className="block text-[12px] text-muted-foreground">
              Subscribe once — every rehearsal and change appears in Apple,
              Google, or Outlook by itself.
            </span>
          </span>
        </Link>
        <Link
          href="/notifications/settings"
          className="flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted"
        >
          <BellRing aria-hidden size={17} className="mt-0.5 shrink-0 text-gold" />
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-[13.5px] font-medium">
              Turn on notifications
              <ArrowRight aria-hidden size={13} className="text-muted-foreground" />
            </span>
            <span className="block text-[12px] text-muted-foreground">
              A cancelled rehearsal should find you, not wait to be found.
            </span>
          </span>
        </Link>
      </div>
    </Card>
  );
}
