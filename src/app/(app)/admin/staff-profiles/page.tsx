import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import {
  approveStaffChangesAction,
  rejectStaffChangesAction,
} from "@/lib/actions/materials";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";

export const metadata = { title: "Staff profile approvals" };

/** Admin review queue for staff profile edits (#14). */
export default async function StaffApprovalsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "admin")) redirect("/dashboard");

  const pending = await getProvider().getPendingStaffChanges(user.id);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Staff profile approvals</h1>
        <p className="text-muted-foreground">
          Changes staff submitted, waiting to go live.
        </p>
      </div>

      {pending.length === 0 ? (
        <EmptyState
          title="Nothing to review"
          description="Staff profile edits will appear here for approval before families see them."
        />
      ) : (
        pending.map((profile) => {
          const changes = profile.pendingChanges ?? {};
          return (
            <Card key={profile.id}>
              <CardHeader className="pb-2">
                <CardTitle as="h2" className="text-base">
                  {profile.fullName}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 pt-0">
                {changes.photoUrl && (
                  <div className="flex items-center gap-4">
                    <figure className="text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={profile.photoUrl || "/brand/novapa-logo.png"}
                        alt=""
                        className="size-20 rounded-full border object-cover"
                      />
                      <figcaption className="mt-1 text-xs text-muted-foreground">
                        Current
                      </figcaption>
                    </figure>
                    <span aria-hidden className="text-muted-foreground">
                      →
                    </span>
                    <figure className="text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={changes.photoUrl}
                        alt="Proposed profile photo"
                        className="size-20 rounded-full border-2 border-primary object-cover"
                      />
                      <figcaption className="mt-1 text-xs text-muted-foreground">
                        Proposed
                      </figcaption>
                    </figure>
                  </div>
                )}

                <FieldDiff label="Title" before={profile.title} after={changes.title} />
                <FieldDiff label="Bio" before={profile.bio} after={changes.bio} />
                <FieldDiff
                  label="Specialties"
                  before={profile.specialties.join(", ")}
                  after={changes.specialties?.join(", ")}
                />
                <FieldDiff label="Credits" before={profile.credits} after={changes.credits} />

                <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row">
                  <form action={approveStaffChangesAction.bind(null, profile.id)}>
                    <Button type="submit">Approve &amp; publish</Button>
                  </form>
                  <form
                    action={rejectStaffChangesAction.bind(null, profile.id)}
                    className="flex flex-1 gap-2"
                  >
                    <Input
                      name="reason"
                      placeholder="Why send it back?"
                      className="flex-1"
                      aria-label={`Reason for rejecting ${profile.fullName}'s changes`}
                    />
                    <Button type="submit" variant="outline">
                      Send back
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

/** Only renders when the field actually changed. */
function FieldDiff({
  label,
  before,
  after,
}: {
  label: string;
  before?: string;
  after?: string;
}) {
  if (after === undefined || after === (before ?? "")) return null;
  return (
    <div className="text-sm">
      <p className="mb-1 flex items-center gap-2 font-medium">
        {label}
        <Badge variant="gold">changed</Badge>
      </p>
      {before && (
        <p className="text-muted-foreground line-through decoration-muted-foreground/50">
          {before}
        </p>
      )}
      <p>{after || <span className="italic text-muted-foreground">(cleared)</span>}</p>
    </div>
  );
}
