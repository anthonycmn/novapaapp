import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Bell, Images, Megaphone, Ticket } from "lucide-react";
import { org } from "@/config/org";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { ExternalLinkButton } from "@/components/external-link-button";
import { ComingSoonCards, WhoToEmail } from "@/components/productions/who-to-email";
import { RehearsalTracks } from "@/components/productions/rehearsal-tracks";
import { ScenesAndSongs } from "@/components/productions/scenes-and-songs";

export const metadata = { title: "Production" };

/**
 * Production page. Tickets (#12) are surfaced here contextually — this is
 * where a parent looks when they want to invite grandparents.
 */
export default async function ProductionPage({
  params,
}: {
  params: Promise<{ productionId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { productionId } = await params;

  const provider = getProvider();
  const production = await provider.getProduction(productionId);
  if (!production) notFound();

  const [staff, templates] = await Promise.all([
    provider.getStaffProfiles(),
    provider.getButtonTemplates(productionId),
  ]);
  const director = staff.find((member) => member.id === production.directorStaffId);
  // The hub calls it "Sweeney Todd - Teen Conservatory"; the staff portal
  // calls it "Sweeney Todd: School Edition". Match on the title both share.
  const isSweeney = production.title.toLowerCase().includes("sweeney");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{production.title}</h1>
        <p className="text-muted-foreground">
          {production.venue}
          {production.opensOn && ` · opens ${formatDate(`${production.opensOn}T12:00:00Z`)}`}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tickets</CardTitle>
          <CardDescription>
            Seats are sold through BookTix, our ticketing partner.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ExternalLinkButton href={production.ticketsUrl ?? org.ticketsUrl}>
            <Ticket aria-hidden className="size-4" />
            Buy tickets on BookTix
          </ExternalLinkButton>
        </CardContent>
      </Card>

      {templates.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Spirit buttons</CardTitle>
            <CardDescription>
              Custom buttons with your performer&apos;s photo and role.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link
              href="/store"
              className="inline-flex h-11 items-center rounded-lg border px-4 text-sm font-semibold hover:bg-accent"
            >
              Design a button
            </Link>
          </CardContent>
        </Card>
      )}

      {director && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Creative team</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Link
              href={`/staff/${director.id}`}
              className="flex items-center gap-3 hover:opacity-80"
            >
              <Avatar name={director.fullName} src={director.photoUrl} />
              <div>
                <p className="font-medium">{director.fullName}</p>
                <p className="text-sm text-muted-foreground">Director</p>
              </div>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Sweeney-specific for now: the breakdown and the MTI code are
          transcribed from that show's master workbook, so they are keyed to
          it by title rather than pretended to be generic. The next show gets
          its own config file beside sweeney-todd.ts. */}
      {isSweeney && (
        <>
          <RehearsalTracks />
          <ScenesAndSongs />
        </>
      )}

      {/* What a show week actually needs from a parent, in one place: the
          news the directors post, photos, and who to email about what.
          Meals and volunteering are announced but not yet open — saying
          "coming soon" tells a family the thing exists and that they have
          not missed it. */}
      <Card pad={false}>
        <SectionHeader title="Keeping up with the show" inCard />
        <div className="grid gap-2 p-4 sm:grid-cols-3">
          <Link
            href="/feed"
            className="flex items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted"
          >
            <Megaphone aria-hidden size={15} className="mt-0.5 shrink-0 text-gold" />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">Live updates</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                Posts from the directors, and answers to what families ask
              </span>
            </span>
          </Link>
          <Link
            href="/photos"
            className="flex items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted"
          >
            <Images aria-hidden size={15} className="mt-0.5 shrink-0 text-gold" />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">Photos</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                Rehearsal and performance galleries
              </span>
            </span>
          </Link>
          <Link
            href="/notifications/settings"
            className="flex items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted"
          >
            <Bell aria-hidden size={15} className="mt-0.5 shrink-0 text-gold" />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">Notifications</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                Choose what we tell you about, and when
              </span>
            </span>
          </Link>
        </div>
      </Card>

      <WhoToEmail />

      <ComingSoonCards />

      {hasRoleAtLeast(user, "staff") && (
        <Link
          href={`/admin/casting-review/${production.id}`}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Open pre-casting review
        </Link>
      )}
    </div>
  );
}
