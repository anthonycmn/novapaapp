import Link from "next/link";
import { redirect } from "next/navigation";
import { Ticket } from "lucide-react";
import { org } from "@/config/org";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLinkButton } from "@/components/external-link-button";

export const metadata = { title: "Productions" };

export default async function ProductionsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const productions = await getProvider().getProductions();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Productions</h1>
        <ExternalLinkButton href={org.ticketsUrl} variant="outline">
          <Ticket aria-hidden className="size-4" />
          All tickets
        </ExternalLinkButton>
      </div>

      {productions.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No productions announced yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {productions.map((production) => (
            <Link key={production.id} href={`/productions/${production.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <p className="font-medium">{production.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {production.venue}
                    {production.opensOn &&
                      ` · ${formatDate(`${production.opensOn}T12:00:00Z`)}`}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
