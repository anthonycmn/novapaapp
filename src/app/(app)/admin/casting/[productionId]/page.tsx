import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import {
  fetchWebsiteCastRoster,
  type WebsiteCastRosterEntry,
} from "@/lib/api/registration";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CastingBoardView } from "./casting-board";

/**
 * The registration system's cast roster, straight from the website's tables
 * in the shared database. Read-only context for directors; absent (not an
 * error) when the app runs on mock data or the roster can't be reached.
 */
async function websiteRoster(): Promise<Map<string, WebsiteCastRosterEntry[]> | null> {
  if ((process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") !== "supabase") return null;
  try {
    const entries = await fetchWebsiteCastRoster();
    if (entries.length === 0) return null;
    const bySession = new Map<string, WebsiteCastRosterEntry[]>();
    for (const entry of entries) {
      const key = entry.session || "Unscheduled";
      bySession.set(key, [...(bySession.get(key) ?? []), entry]);
    }
    return bySession;
  } catch {
    return null;
  }
}

export const metadata = { title: "Casting board" };

export default async function CastingPage({
  params,
}: {
  params: Promise<{ productionId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const { productionId } = await params;
  const provider = getProvider();
  const production = await provider.getProduction(productionId);
  if (!production) notFound();

  const { board, roles, unassigned, studentsById } = await provider.getCastingBoard(
    user.id,
    productionId
  );
  const registrationRoster = await websiteRoster();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Casting — {production.title}</h1>
          <p className="text-muted-foreground">
            Drag a student onto a role, or tap the student then the role.
          </p>
        </div>
        <div className="flex gap-3 text-sm font-medium">
          <Link
            href={`/admin/auditions/${productionId}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            ← Audition roster
          </Link>
          <Link
            href={`/admin/casting-responses/${productionId}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            Responses →
          </Link>
        </div>
      </div>

      <CastingBoardView
        productionId={productionId}
        board={board}
        roles={roles}
        unassigned={unassigned}
        studentsById={studentsById}
      />

      {registrationRoster && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Registration cast roster</CardTitle>
            <CardDescription>
              Live from the registration system — the families the website has
              on each cast. Read-only; casting decisions happen on the board
              above.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...registrationRoster.entries()].map(([session, entries]) => (
              <div key={session} className="rounded-lg border p-3">
                <h3 className="font-medium">
                  {session}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    · {entries.length} {entries.length === 1 ? "family" : "families"}
                  </span>
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {entries.map((entry) => (
                    <li key={`${entry.email}-${entry.castName}`} className="truncate">
                      {entry.castName || entry.email}
                      {entry.castName && (
                        <span className="ml-1 text-xs">({entry.email})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
