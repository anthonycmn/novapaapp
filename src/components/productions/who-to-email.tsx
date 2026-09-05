import Link from "next/link";
import { Mail, UtensilsCrossed, HandHeart } from "lucide-react";
import { STAFF_CONTACTS } from "@/config/contacts";
import type { ProductionStaffMember } from "@/lib/api/types";
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
  showStaff = [],
  showTitle,
}: {
  /**
   * This show's own team — CJ, 4 Sep 2026: "each show should have a different
   * 'who to contact' based on the show's assigned staff."
   *
   * Empty is a normal answer, not an error: a show with nobody published, or a
   * portal where 0226 has not yet opened production_staff to families, simply
   * shows the standing desks below.
   */
  showStaff?: ProductionStaffMember[];
  showTitle: string;
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
      {showStaff.length > 0 && (
        <div className="border-b bg-muted/40 px-4 py-3">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-gold">
            On {showTitle}
          </p>
          {/*
            Names and jobs, linked to their profile rather than an address.
            family_hub.staff_profiles holds no email — the bio and the photo
            are what it keeps — so this offers the thing that exists instead of
            a mailto that would have to be invented.
          */}
          <ul className="mt-1.5 flex flex-col gap-1">
            {showStaff.map((member) => (
              <li
                key={`${member.staffId}-${member.role}`}
                className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px]"
              >
                {member.isPublished ? (
                  <Link
                    href={`/staff/${member.staffId}`}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {member.fullName}
                  </Link>
                ) : (
                  /* Named, but not linked: there is no published bio behind
                     them yet. Leaving the name out instead would drop this
                     show's director off its own page. */
                  <span className="font-medium text-foreground">{member.fullName}</span>
                )}
                <span className="text-[11.5px] uppercase tracking-wide text-muted-foreground">
                  {member.role}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-muted-foreground">
            For anything about the show itself, these are the people in the
            room. The desks below answer for any production.
          </p>
        </div>
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
 * Meals and volunteering are real parts of a show week. Meals genuinely is
 * coming soon; volunteering SHIPPED on Aug 26 and this card kept saying it
 * hadn't (Sep 5 2026 audit) — every show page told parents a live feature
 * didn't exist, and didn't link to it. Now the volunteer card is the way in.
 */
export function ComingSoonCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="border-dashed" pad>
        <div className="flex items-start gap-3">
          <UtensilsCrossed aria-hidden size={17} className="mt-0.5 shrink-0 text-gold" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[14px] font-semibold">Meals &amp; potluck</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Coming soon
              </span>
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              Who is bringing what for tech week and show nights. Sign-ups open
              here once the run is set.
            </p>
          </div>
        </div>
      </Card>

      <Link href="/volunteers" className="gold-hover block">
        <Card pad>
          <div className="flex items-start gap-3">
            <HandHeart aria-hidden size={17} className="mt-0.5 shrink-0 text-gold" />
            <div className="min-w-0">
              <h3 className="text-[14px] font-semibold">Volunteer sign-ups</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                Front of house, costumes, load-in and strike. See the published
                sheets for your shows and take a slot.
              </p>
            </div>
          </div>
        </Card>
      </Link>
    </div>
  );
}
