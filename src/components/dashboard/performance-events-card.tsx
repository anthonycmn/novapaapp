import Link from "next/link";
import { ArrowRight, MailQuestion, MicVocal } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { getPerformance } from "@/lib/performance";
import { countdown } from "@/lib/performance/rules";
import { ACT_STATUS_LABELS } from "@/lib/performance/types";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * Performance Events on Home (hub 0097): an open event one of the family's
 * students may sign up for, an act already in, or an invitation from
 * another family to answer. Nothing to show means no tile at all.
 */
export async function PerformanceEventsCard() {
  const user = await getSessionUser();
  if (!user?.familyId) return null;
  const service = getPerformance();
  const cards = await service.listEventsForFamily(user).catch(() => []);
  const invites = cards.length ? await service.getInvites(user).catch(() => []) : [];
  const lines = cards.flatMap((card) => {
    const live = card.myActs.filter((a) => a.status !== "withdrawn");
    if (!card.open && !live.length) return [];
    const left = card.open ? countdown(card.event.signupClosesAt) : null;
    const text = live.length
      ? live.map((a) => `${a.title ?? "Act"}: ${ACT_STATUS_LABELS[a.status]}`).join(" · ")
      : left
        ? `Sign-ups open · ${left}`
        : "Sign-ups open";
    return [{ id: card.event.id, title: card.event.title, text }];
  });
  if (!lines.length && !invites.length) return null;

  return (
    <Card pad={false} data-tour="performance-events-tile">
      <SectionHeader title="Sign up to perform" inCard />
      <ul className="divide-y">
        {invites.map((invite) => (
          <li key={invite.performerId}>
            <Link
              href={`/family/events/${invite.eventId}#invites`}
              className="flex items-center gap-3 px-4 py-2.5 text-[13.5px] transition-colors hover:bg-muted"
            >
              <MailQuestion aria-hidden size={16} className="shrink-0 text-gold" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{invite.invitedByFamilyName}</span>
                <span className="text-muted-foreground"> invited your student to perform in {invite.eventTitle}</span>
              </span>
              <ArrowRight aria-hidden size={13} className="text-muted-foreground" />
            </Link>
          </li>
        ))}
        {lines.map((line) => (
          <li key={line.id}>
            <Link
              href={`/family/events/${line.id}`}
              className="flex items-center gap-3 px-4 py-2.5 text-[13.5px] transition-colors hover:bg-muted"
            >
              <MicVocal aria-hidden size={16} className="shrink-0 text-gold" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{line.title}</span>
                <span className="text-muted-foreground"> · {line.text}</span>
              </span>
              <ArrowRight aria-hidden size={13} className="text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
