import Link from "next/link";
import { ArrowRight, Ticket } from "lucide-react";
import { fetchPunchCards, dayLabel } from "@/lib/api/registration/punch-card";
import { todayKey } from "@/lib/calendar/week";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * The punch card, in one line per child, on the dashboard — only while there
 * is something on it: credits to spend, or a day coming up. A family with
 * neither has no tile, not an empty one.
 *
 * Reads the same cached loader the page does (React cache(), like billing),
 * so the dashboard and the page can never disagree about a balance.
 */
export async function PunchCardCard({ familyId }: { familyId: string }) {
  const board = await fetchPunchCards(familyId).catch(() => null);
  if (!board || board.status !== "ok") return null;
  const today = todayKey();
  const lines = board.cards.flatMap((card) => {
    if (!card.camper) return [];
    const next = card.days.find((d) => d.booked && d.date >= today);
    if (card.credits.day <= 0 && !next) return [];
    const first = card.student.preferredName ?? card.student.firstName;
    const bits: string[] = [];
    if (card.credits.day > 0) bits.push(`${card.credits.day} credit${card.credits.day === 1 ? "" : "s"}`);
    if (next) bits.push(`next: ${dayLabel(next.date)}`);
    return [{ id: card.student.id, first, text: bits.join(" · ") }];
  });
  if (!lines.length) return null;

  return (
    <Card pad={false} data-tour="punch-card-tile">
      <SectionHeader title="Day camp punch card" inCard />
      <ul className="divide-y">
        {lines.map((line) => (
          <li key={line.id}>
            <Link
              href="/day-camps"
              className="flex items-center gap-3 px-4 py-2.5 text-[13.5px] transition-colors hover:bg-muted"
            >
              <Ticket aria-hidden size={16} className="shrink-0 text-gold" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{line.first}</span>
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
