import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Ticket } from "lucide-react";
import { org } from "@/config/org";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLinkButton } from "@/components/external-link-button";

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
