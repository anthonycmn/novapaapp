import Link from "next/link";
import { Mail, UtensilsCrossed, HandHeart } from "lucide-react";
import { STAFF_CONTACTS } from "@/config/contacts";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * "Who do I email about this?" — the question families ask most, answered
 * without them having to guess.
 *
 * Every row is a mailto, because a parent reading this on a phone at 9pm
 * wants to send the message now, not copy an address into another app.
 */
export function WhoToEmail({
  director,
}: {
  /** Folded in from the old "Creative team" card — one person, one place. */
  director?: { id: string; fullName: string } | null;
}) {
  return (
    <Card pad={false}>
      <SectionHeader
        title="Who to email"
        inCard
        right={
          <span className="text-[12px] text-muted-foreground">
            Staff only — we never publish family addresses
          </span>
        }
      />
      {director && (
        <p className="border-b bg-muted/40 px-4 py-2 text-[12px] text-muted-foreground">
          Directing this show:{" "}
          <Link
            href={`/staff/${director.id}`}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {director.fullName}
          </Link>
        </p>
      )}
      <ul className="divide-y">
        {STAFF_CONTACTS.map((contact) => (
          <li key={contact.email} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-[13px] font-medium">{contact.name}</p>
              <p className="text-[11.5px] uppercase tracking-wide text-gold">
                {contact.title}
              </p>
            </div>
            <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
              {contact.forWhat}
            </p>
            <a
              href={`mailto:${contact.email}`}
              className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] text-primary underline-offset-4 hover:underline"
            >
              <Mail aria-hidden size={13} />
              {contact.email}
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * Meals and volunteering are real parts of a show week, and families ask
 * about them before we are ready to take sign-ups. Saying "coming soon"
 * beats saying nothing: it tells a parent the thing exists and that they
 * have not missed it.
 */
export function ComingSoonCards() {
  const items = [
    {
      Icon: UtensilsCrossed,
      title: "Meals & potluck",
      body: "Who is bringing what for tech week and show nights. Sign-ups open here once the run is set.",
    },
    {
      Icon: HandHeart,
      title: "Volunteer sign-ups",
      body: "Front of house, costumes, load-in and strike. We will post the slots here when they are ready.",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map(({ Icon, title, body }) => (
        <Card key={title} className="border-dashed" pad>
          <div className="flex items-start gap-3">
            <Icon aria-hidden size={17} className="mt-0.5 shrink-0 text-gold" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[14px] font-semibold">{title}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Coming soon
                </span>
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
