import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { CastingBoardView } from "./casting-board";

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
    </div>
  );
}
